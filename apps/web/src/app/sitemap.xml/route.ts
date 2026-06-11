import { NextResponse, type NextRequest } from 'next/server';
import { count, eq } from 'drizzle-orm';
import {publishedPages} from '@cms/db';
import { db } from '@/lib/db';
import { resolveSiteByHost } from '@/lib/site-resolver';
import { siteOrigin } from '@/lib/page-data';
import { escapeXml, SHARD_SIZE, shardXml, conditional304 } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

/**
 * Host-aware sitemap. Below SHARD_SIZE URLs this is a plain urlset; above it,
 * a sitemap index pointing at /sitemaps/{n}.xml shards (50k/50MB protocol cap).
 * lastmod = real publish timestamp; Last-Modified + 304 keeps crawler re-polls
 * nearly free. priority/changefreq omitted (ignored by Google).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const site = await resolveSiteByHost(host);
  if (!site) return new NextResponse('Not found', { status: 404 });

  const origin = siteOrigin({ ...site, settings: site.settings as Record<string, unknown> });
  const [row] = await db()
    .select({ value: count() })
    .from(publishedPages)
    .where(eq(publishedPages.siteId, site.id));
  const total = row?.value ?? 0;

  if (total > SHARD_SIZE) {
    const shards = Math.ceil(total / SHARD_SIZE);
    const entries = Array.from(
      { length: shards },
      (_, i) => `  <sitemap>\n    <loc>${escapeXml(`${origin}/sitemaps/${i}.xml`)}</loc>\n  </sitemap>`,
    ).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
    return new NextResponse(xml, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  }

  const { xml, lastModified } = await shardXml(site.id, origin, 0);
  const notModified = conditional304(req, lastModified);
  if (notModified) return notModified;

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'last-modified': lastModified.toUTCString(),
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
  });
}
