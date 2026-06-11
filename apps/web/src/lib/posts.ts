import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, count, desc, eq } from 'drizzle-orm';
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

export interface PostsPage {
  posts: PostSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Paginated posts for archive listings with crawlable rel=prev/next. */
export const getPostsPage = (siteId: string, locale: string, page = 1, perPage = 10) =>
  unstable_cache(
    async (): Promise<PostsPage> => {
      const offset = (page - 1) * perPage;
      const totalRows = await db()
        .select({ value: count() })
        .from(publishedPages)
        .innerJoin(pages, eq(pages.id, publishedPages.pageId))
        .where(
          and(
            eq(publishedPages.siteId, siteId),
            eq(publishedPages.locale, locale),
            eq(pages.kind, 'post'),
          ),
        );
      const total = totalRows[0]?.value ?? 0;
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
        .limit(perPage)
        .offset(offset);
      return {
        posts: rows.map((r) => ({
          path: r.path,
          locale: r.locale,
          title: (r.seo as { title?: string }).title ?? '',
          description: (r.seo as { description?: string }).description ?? '',
          author: r.author,
          publishedAt: r.publishedAt.toISOString(),
          firstPublishedAt: (r.firstPublishedAt ?? r.publishedAt).toISOString(),
        })),
        total,
        page,
        perPage,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      };
    },
    ['posts-page', siteId, locale, String(page), String(perPage)],
    { tags: [postsTag(siteId, locale)] },
  )();

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
