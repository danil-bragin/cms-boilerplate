import { ConflictException, Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { isUniqueViolation } from '../db/pg-errors.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { pages, pageLocales, pageVersions, publishedPages, sites } from '@cms/db';
import type { LocaleSummary, PageSummary } from '@cms/contracts';
import { DB, type Db } from '../db/db.module.js';

const EMPTY_PUCK_DATA = { root: { props: {} }, content: [], zones: {} };

@Injectable()
export class PagesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listSites() {
    return this.db.query.sites.findMany();
  }

  async listPages(siteId: string): Promise<PageSummary[]> {
    const sitePages = await this.db.query.pages.findMany({
      where: eq(pages.siteId, siteId),
      orderBy: pages.path,
    });
    if (sitePages.length === 0) return [];

    const pageIds = sitePages.map((p) => p.id);
    const locales = await this.db.query.pageLocales.findMany({
      where: inArray(pageLocales.pageId, pageIds),
    });

    // one query per concern instead of two queries per locale
    const latestRows = locales.length
      ? await this.db
          .selectDistinctOn([pageVersions.pageLocaleId], {
            pageLocaleId: pageVersions.pageLocaleId,
            versionNo: pageVersions.versionNo,
            status: pageVersions.status,
          })
          .from(pageVersions)
          .where(inArray(pageVersions.pageLocaleId, locales.map((l) => l.id)))
          .orderBy(pageVersions.pageLocaleId, sql`${pageVersions.versionNo} DESC`)
      : [];
    const latestByLocale = new Map(latestRows.map((r) => [r.pageLocaleId, r]));

    const publishedRows = pageIds.length
      ? await this.db
          .select({
            pageId: publishedPages.pageId,
            locale: publishedPages.locale,
            versionId: publishedPages.versionId,
          })
          .from(publishedPages)
          .where(inArray(publishedPages.pageId, pageIds))
      : [];
    const publishedByKey = new Map(publishedRows.map((r) => [`${r.pageId}:${r.locale}`, r.versionId]));

    const summaries = new Map<string, LocaleSummary>();
    for (const loc of locales) {
      const latest = latestByLocale.get(loc.id);
      summaries.set(loc.id, {
        pageLocaleId: loc.id,
        locale: loc.locale,
        slugOverride: loc.slugOverride,
        latestVersionNo: latest?.versionNo ?? 0,
        latestStatus: latest?.status ?? 'draft',
        publishedVersionId: publishedByKey.get(`${loc.pageId}:${loc.locale}`) ?? null,
      });
    }

    return sitePages.map((p) => ({
      id: p.id,
      siteId: p.siteId,
      path: p.path,
      name: p.name,
      locales: locales.filter((l) => l.pageId === p.id).map((l) => summaries.get(l.id)!),
    }));
  }

  async createPage(siteId: string, path: string, name: string, createdBy: string): Promise<PageSummary> {
    const site = await this.db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) throw new NotFoundException({ code: 'site_not_found', message: 'Site not found' });

    const normalized = normalizePath(path);

    try {
      return await this.db.transaction(async (tx) => {
      const existing = await tx.query.pages.findFirst({
        where: and(eq(pages.siteId, siteId), eq(pages.path, normalized)),
      });
      if (existing) {
        throw new ConflictException({ code: 'page_exists', message: `Page ${normalized} already exists` });
      }

      const [page] = await tx.insert(pages).values({ siteId, path: normalized, name }).returning();
      const [locale] = await tx
        .insert(pageLocales)
        .values({ pageId: page!.id, locale: site.defaultLocale })
        .returning();
      const [version] = await tx
        .insert(pageVersions)
        .values({
          pageLocaleId: locale!.id,
          versionNo: 1,
          puckData: EMPTY_PUCK_DATA,
          createdBy,
        })
        .returning();

      return {
        id: page!.id,
        siteId,
        path: normalized,
        name,
        locales: [
          {
            pageLocaleId: locale!.id,
            locale: locale!.locale,
            slugOverride: null,
            latestVersionNo: version!.versionNo,
            latestStatus: version!.status,
            publishedVersionId: null,
          },
        ],
      };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({ code: 'page_exists', message: `Page ${normalized} already exists` });
      }
      throw err;
    }
  }

  async addLocale(pageId: string, locale: string, createdBy: string) {
    const page = await this.db.query.pages.findFirst({ where: eq(pages.id, pageId) });
    if (!page) throw new NotFoundException({ code: 'page_not_found', message: 'Page not found' });

    const site = await this.db.query.sites.findFirst({ where: eq(sites.id, page.siteId) });
    if (!site!.locales.includes(locale)) {
      throw new BadRequestException({
        code: 'locale_not_allowed',
        message: `Locale ${locale} is not configured for this site`,
      });
    }

    return this.db.transaction(async (tx) => {
      const existing = await tx.query.pageLocales.findFirst({
        where: and(eq(pageLocales.pageId, pageId), eq(pageLocales.locale, locale)),
      });
      if (existing) {
        throw new ConflictException({ code: 'locale_exists', message: `Locale ${locale} already added` });
      }
      const [row] = await tx.insert(pageLocales).values({ pageId, locale }).returning();
      await tx.insert(pageVersions).values({
        pageLocaleId: row!.id,
        versionNo: 1,
        puckData: EMPTY_PUCK_DATA,
        createdBy,
      });
      return row!;
    });
  }
}

export function normalizePath(path: string): string {
  if (path === '/') return path;
  return '/' + path.split('/').filter(Boolean).join('/');
}
