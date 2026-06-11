import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { pages, publishedPages } from '@cms/db';
import { db } from '@/lib/db';
import { resolveSiteByHost } from '@/lib/site-resolver';
import { siteOrigin } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * Google News sitemap: posts (kind=post) first-published in the last 48h.
 * Linked from robots.txt. Empty when no recent posts (valid).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const site = await resolveSiteByHost(host);
  if (!site) return new NextResponse('Not found', { status: 404 });

  const origin = siteOrigin({ ...site, settings: site.settings as Record<string, unknown> });
  const orgName = (site.settings as { org?: { name?: string } }).org?.name ?? site.slug;
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const rows = await db()
    .select({
      locale: publishedPages.locale,
      path: publishedPages.path,
      seo: publishedPages.seo,
      firstPublishedAt: pages.firstPublishedAt,
    })
    .from(publishedPages)
    .innerJoin(pages, eq(pages.id, publishedPages.pageId))
    .where(
      and(
        eq(publishedPages.siteId, site.id),
        eq(pages.kind, 'post'),
        gte(pages.firstPublishedAt, cutoff),
      ),
    )
    .orderBy(desc(pages.firstPublishedAt))
    .limit(1000);

  const items = rows
    .map((r) => {
      const loc = `${origin}/${r.locale}${r.path === '/' ? '' : r.path}`;
      const title = (r.seo as { title?: string }).title ?? '';
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(orgName)}</news:name>
        <news:language>${escapeXml(r.locale.split('-')[0]!)}</news:language>
      </news:publication>
      <news:publication_date>${(r.firstPublishedAt ?? new Date()).toISOString()}</news:publication_date>
      <news:title>${escapeXml(title)}</news:title>
    </news:news>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items}
</urlset>
`;
  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  });
}
