import { NextResponse, type NextRequest } from 'next/server';
import { sites } from '@cms/db';
import { db } from '@/lib/db';
import { siteOrigin } from '@/lib/page-data';
import { getLatestPosts } from '@/lib/posts';

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * RSS 2.0 feed of posts (host-aware, ?locale= optional, defaults to the site's
 * default locale). Conditional requests: crawlers and readers re-poll feeds
 * aggressively — Last-Modified + 304 makes that nearly free.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const allSites = await db().select().from(sites);
  const site = allSites.find((s) => s.domains.includes(host));
  if (!site) return new NextResponse('Not found', { status: 404 });

  const locale = req.nextUrl.searchParams.get('locale') ?? site.defaultLocale;
  const origin = siteOrigin({ ...site, settings: site.settings as Record<string, unknown> });
  const posts = await getLatestPosts(site.id, locale, 50);

  const lastModified = posts[0] ? new Date(posts[0].publishedAt) : new Date(0);
  const ifModifiedSince = req.headers.get('if-modified-since');
  if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= lastModified.getTime()) {
    return new NextResponse(null, { status: 304 });
  }

  const items = posts
    .map((post) => {
      const url = `${origin}/${post.locale}${post.path === '/' ? '' : post.path}`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(post.description)}</description>
      ${post.author ? `<author>${escapeXml(post.author)}</author>` : ''}
      <pubDate>${new Date(post.firstPublishedAt).toUTCString()}</pubDate>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.slug)}</title>
    <link>${escapeXml(`${origin}/${locale}`)}</link>
    <description>${escapeXml(site.slug)} — latest posts</description>
    <language>${escapeXml(locale)}</language>
    <lastBuildDate>${lastModified.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${origin}/feed.xml?locale=${locale}`)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'last-modified': lastModified.toUTCString(),
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
