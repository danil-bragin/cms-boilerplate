import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { publishedPages } from '@cms/db';
import { db } from './db';

export interface PublishedPage {
  siteId: string;
  locale: string;
  path: string;
  pageId: string;
  puckData: unknown;
  seo: { title?: string; description?: string };
}

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
