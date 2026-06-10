import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { publishedPages, sites } from '@cms/db';
import { db } from '@/lib/db';
import { siteOrigin } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * Host-aware sitemap (the file convention can't read the Host header).
 * lastmod = real publish timestamp — Google only trusts lastmod when it is
 * "consistently and verifiably accurate". priority/changefreq omitted (ignored).
 * hreflang lives in page link tags, not here (one channel, no contradictions).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const allSites = await db().select().from(sites);
  const site = allSites.find((s) => s.domains.includes(host));
  if (!site) return new NextResponse('Not found', { status: 404 });

  const origin = siteOrigin({ ...site, settings: site.settings as Record<string, unknown> });
  const rows = await db()
    .select({
      locale: publishedPages.locale,
      path: publishedPages.path,
      publishedAt: publishedPages.publishedAt,
    })
    .from(publishedPages)
    .where(eq(publishedPages.siteId, site.id));

  const urls = rows
    .map((r) => {
      const loc = `${origin}/${r.locale}${r.path === '/' ? '' : r.path}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${r.publishedAt.toISOString()}</lastmod>\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // crawlers poll sitemaps; short CDN cache keeps origin load near zero
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
  });
}
