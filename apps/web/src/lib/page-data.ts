import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { pages, publishedPages, sites } from '@cms/db';
import { db } from './db';

export interface SiteInfo {
  id: string;
  slug: string;
  domains: string[];
  defaultLocale: string;
  locales: string[];
  settings: Record<string, unknown>;
}

/** Site lookup for metadata (name, primary domain, locales). Tagged `sites`. */
export const getSiteById = (siteId: string) =>
  unstable_cache(
    async (): Promise<SiteInfo | null> => {
      const row = await db().query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!row) return null;
      return {
        id: row.id,
        slug: row.slug,
        domains: row.domains,
        defaultLocale: row.defaultLocale,
        locales: row.locales,
        settings: row.settings as Record<string, unknown>,
      };
    },
    ['site-by-id', siteId],
    { tags: ['sites'] },
  )();

/** Public origin for a site: primary domain = domains[0]. */
export function siteOrigin(site: SiteInfo): string {
  const scheme = process.env.SITE_URL_SCHEME ?? 'https';
  const domain = site.domains[0] ?? 'localhost';
  const port = process.env.SITE_URL_PORT ? `:${process.env.SITE_URL_PORT}` : '';
  return `${scheme}://${domain}${port}`;
}

export interface PublishedPage {
  siteId: string;
  locale: string;
  path: string;
  pageId: string;
  puckData: unknown;
  seo: { title?: string; description?: string };
  publishedAt: Date;
  kind: 'page' | 'post';
  author: string | null;
  firstPublishedAt: Date | null;
}

/**
 * The hot read path: one row from the denormalized snapshot.
 * Tagged per page so publish invalidates exactly this entry on every replica.
 */
export const getPublishedPage = (siteId: string, locale: string, path: string) =>
  unstable_cache(
    async (): Promise<PublishedPage | null> => {
      const rows = await db()
        .select({
          published: publishedPages,
          kind: pages.kind,
          author: pages.author,
          firstPublishedAt: pages.firstPublishedAt,
        })
        .from(publishedPages)
        .innerJoin(pages, eq(pages.id, publishedPages.pageId))
        .where(
          and(
            eq(publishedPages.siteId, siteId),
            eq(publishedPages.locale, locale),
            eq(publishedPages.path, path),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        siteId: row.published.siteId,
        locale: row.published.locale,
        path: row.published.path,
        pageId: row.published.pageId,
        puckData: row.published.puckData,
        seo: row.published.seo as PublishedPage['seo'],
        publishedAt: row.published.publishedAt,
        kind: row.kind,
        author: row.author,
        firstPublishedAt: row.firstPublishedAt,
      };
    },
    ['published-page', siteId, locale, path],
    { tags: [pageTag(siteId, locale, path)] },
  )();

/** Locales this page is published in — for hreflang alternates. */
export const getPublishedAlternates = (pageId: string) =>
  unstable_cache(
    async (): Promise<Array<{ locale: string; path: string }>> => {
      return db()
        .select({ locale: publishedPages.locale, path: publishedPages.path })
        .from(publishedPages)
        .where(eq(publishedPages.pageId, pageId));
    },
    ['published-alternates', pageId],
    { tags: [alternatesTag(pageId)] },
  )();

export function pageTag(siteId: string, locale: string, path: string): string {
  return `page:${siteId}:${locale}:${path}`;
}

export function alternatesTag(pageId: string): string {
  return `alts:${pageId}`;
}
