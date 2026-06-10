import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { pages, publishedPages } from '@cms/db';
import { db } from './db';

export interface PostSummary {
  path: string;
  locale: string;
  title: string;
  description: string;
  author: string | null;
  publishedAt: string;
  firstPublishedAt: string;
}

export function postsTag(siteId: string, locale: string): string {
  return `posts:${siteId}:${locale}`;
}

/** Latest published posts for listings/RSS — invalidated by the posts tag on any post publish. */
export const getLatestPosts = (siteId: string, locale: string, limit = 50) =>
  unstable_cache(
    async (): Promise<PostSummary[]> => {
      const rows = await db()
        .select({
          path: publishedPages.path,
          locale: publishedPages.locale,
          seo: publishedPages.seo,
          publishedAt: publishedPages.publishedAt,
          author: pages.author,
          firstPublishedAt: pages.firstPublishedAt,
        })
        .from(publishedPages)
        .innerJoin(pages, eq(pages.id, publishedPages.pageId))
        .where(
          and(
            eq(publishedPages.siteId, siteId),
            eq(publishedPages.locale, locale),
            eq(pages.kind, 'post'),
          ),
        )
        .orderBy(desc(pages.firstPublishedAt))
        .limit(limit);
      return rows.map((r) => ({
        path: r.path,
        locale: r.locale,
        title: (r.seo as { title?: string }).title ?? '',
        description: (r.seo as { description?: string }).description ?? '',
        author: r.author,
        publishedAt: r.publishedAt.toISOString(),
        firstPublishedAt: (r.firstPublishedAt ?? r.publishedAt).toISOString(),
      }));
    },
    ['latest-posts', siteId, locale, String(limit)],
    { tags: [postsTag(siteId, locale)] },
  )();
