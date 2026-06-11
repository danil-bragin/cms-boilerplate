import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { authors, pages, publishedPages } from '@cms/db';
import { db } from './db';

export interface AuthorWithPosts {
  id: string;
  slug: string;
  name: string;
  bio: string;
  avatarKey: string | null;
  sameAs: string[];
  posts: Array<{ path: string; locale: string; title: string; firstPublishedAt: string }>;
}

export const getAuthor = (siteId: string, slug: string, locale: string) =>
  unstable_cache(
    async (): Promise<AuthorWithPosts | null> => {
      const author = await db().query.authors.findFirst({
        where: and(eq(authors.siteId, siteId), eq(authors.slug, slug)),
      });
      if (!author) return null;
      const posts = await db()
        .select({
          path: publishedPages.path,
          locale: publishedPages.locale,
          seo: publishedPages.seo,
          firstPublishedAt: pages.firstPublishedAt,
          publishedAt: publishedPages.publishedAt,
        })
        .from(publishedPages)
        .innerJoin(pages, eq(pages.id, publishedPages.pageId))
        .where(
          and(
            eq(publishedPages.siteId, siteId),
            eq(publishedPages.locale, locale),
            eq(pages.kind, 'post'),
            eq(pages.authorId, author.id),
          ),
        )
        .orderBy(desc(pages.firstPublishedAt))
        .limit(50);
      return {
        id: author.id,
        slug: author.slug,
        name: author.name,
        bio: author.bio,
        avatarKey: author.avatarKey,
        sameAs: author.sameAs,
        posts: posts.map((p) => ({
          path: p.path,
          locale: p.locale,
          title: (p.seo as { title?: string }).title ?? '',
          firstPublishedAt: (p.firstPublishedAt ?? p.publishedAt).toISOString(),
        })),
      };
    },
    ['author', siteId, slug, locale],
    { tags: [`author:${siteId}:${slug}`] },
  )();
