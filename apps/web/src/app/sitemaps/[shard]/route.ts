import { NextResponse, type NextRequest } from 'next/server';

import { db } from '@/lib/db';
import '@/lib/images.server';
import { resolveSiteByHost } from '@/lib/site-resolver';
import { siteOrigin } from '@/lib/page-data';
import { shardXml, conditional304 } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

/** Sitemap shard: /sitemaps/{n}.xml — referenced from the sitemap index. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shard: string }> },
): Promise<NextResponse> {
  const { shard } = await params;
  const n = Number(shard.replace(/\.xml$/, ''));
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    return new NextResponse('Not found', { status: 404 });
  }

  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const site = await resolveSiteByHost(host);
  if (!site) return new NextResponse('Not found', { status: 404 });

  const origin = siteOrigin({ ...site, settings: site.settings as Record<string, unknown> });
  const { xml, lastModified } = await shardXml(site.id, origin, n);
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
