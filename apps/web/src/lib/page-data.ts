import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { sites, publishedPages, pageLocales } from '@cms/db';
import { db } from './db';

export interface PublishedPage {
  siteId: string;
  locale: string;
  path: string;
  pageId: string;
  puckData: unknown;
  seo: { title?: string; description?: string };
}

export interface SiteInfo {
  id: string;
  slug: string;
  defaultLocale: string;
  locales: string[];
}

/** Host → site. Tagged `sites` so site changes can be invalidated wholesale. */
export const getSiteByHost = (host: string) =>
  unstable_cache(
    async (): Promise<SiteInfo | null> => {
      const bare = host.split(':')[0] ?? host;
      const site = await db()
        .select()
        .from(sites)
        .where(sql`${bare} = ANY(${sites.domains})`)
        .limit(1);
      const row = site[0];
      if (!row) return null;
      return { id: row.id, slug: row.slug, defaultLocale: row.defaultLocale, locales: row.locales };
    },
    ['site-by-host', host],
    { tags: ['sites'] },
  )();

/**
 * The hot read path: one row from the denormalized snapshot.
 * Tagged per page so publish invalidates exactly this entry on every replica.
 */
export const getPublishedPage = (siteId: string, locale: string, path: string) =>
  unstable_cache(
    async (): Promise<PublishedPage | null> => {
      const rows = await db()
        .select()
        .from(publishedPages)
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
        siteId: row.siteId,
        locale: row.locale,
        path: row.path,
        pageId: row.pageId,
        puckData: row.puckData,
        seo: row.seo as PublishedPage['seo'],
      };
    },
    ['published-page', siteId, locale, path],
    { tags: [pageTag(siteId, locale, path)] },
  )();

/** Locales this page is published in — for hreflang alternates. */
export const getPublishedAlternates = (pageId: string, siteId: string) =>
  unstable_cache(
    async (): Promise<Array<{ locale: string; path: string }>> => {
      const rows = await db()
        .select({ locale: publishedPages.locale, path: publishedPages.path })
        .from(publishedPages)
        .where(eq(publishedPages.pageId, pageId));
      return rows;
    },
    ['published-alternates', pageId],
    { tags: [`page-alternates:${siteId}`] },
  )();

export function pageTag(siteId: string, locale: string, path: string): string {
  return `page:${siteId}:${locale}:${path}`;
}

export { pageLocales };
