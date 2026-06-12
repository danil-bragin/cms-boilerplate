import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, count, desc, eq } from 'drizzle-orm';
import { pages, publishedPages } from '@cms/db';
import { db } from './db';

/** Raw cover reference extracted from a post's Puck snapshot (URL signed later). */
export interface PostCover {
  s3Key: string;
  width?: number | null;
  height?: number | null;
  blurDataUrl?: string | null;
  alt?: string;
}

export interface PostSummary {
  path: string;
  locale: string;
  title: string;
  description: string;
  author: string | null;
  publishedAt: string;
  firstPublishedAt: string;
  cover: PostCover | null;
}

export function postsTag(siteId: string, locale: string): string {
  return `posts:${siteId}:${locale}`;
}

interface MediaRefShape {
  s3Key?: string;
  width?: number | null;
  height?: number | null;
  blurDataUrl?: string | null;
  alt?: string;
}

const toCover = (ref: MediaRefShape | undefined | null): PostCover | null =>
  ref?.s3Key
    ? { s3Key: ref.s3Key, width: ref.width ?? null, height: ref.height ?? null, blurDataUrl: ref.blurDataUrl ?? null, alt: ref.alt ?? '' }
    : null;

/** Cover = the page's OG image, else the first block carrying a media reference. */
function extractCover(puck: unknown): PostCover | null {
  const data = puck as {
    root?: { props?: { ogImage?: MediaRefShape } };
    content?: Array<{ props?: Record<string, MediaRefShape | undefined> }>;
  };
  const og = toCover(data?.root?.props?.ogImage);
  if (og) return og;
  for (const b of data?.content ?? []) {
    const p = b?.props ?? {};
    const c = toCover(p.media ?? p.image ?? p.backgroundImage);
    if (c) return c;
  }
  return null;
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
          puckData: publishedPages.puckData,
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
          cover: extractCover(r.puckData),
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
          puckData: publishedPages.puckData,
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
        cover: extractCover(r.puckData),
      }));
    },
    ['latest-posts', siteId, locale, String(limit)],
    { tags: [postsTag(siteId, locale)] },
  )();
