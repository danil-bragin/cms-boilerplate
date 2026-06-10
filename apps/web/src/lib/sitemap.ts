import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { publishedPages } from '@cms/db';
import { db } from './db';

export const SHARD_SIZE = 45_000;

export const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function conditional304(req: NextRequest, lastModified: Date): NextResponse | null {
  const since = req.headers.get('if-modified-since');
  if (since && new Date(since).getTime() >= Math.floor(lastModified.getTime() / 1000) * 1000) {
    return new NextResponse(null, { status: 304 });
  }
  return null;
}

/** One urlset shard (offset = shard * SHARD_SIZE), with its max lastmod. */
export async function shardXml(
  siteId: string,
  origin: string,
  shard: number,
): Promise<{ xml: string; lastModified: Date }> {
  const rows = await db()
    .select({
      locale: publishedPages.locale,
      path: publishedPages.path,
      publishedAt: publishedPages.publishedAt,
    })
    .from(publishedPages)
    .where(eq(publishedPages.siteId, siteId))
    .orderBy(asc(publishedPages.publishedAt))
    .limit(SHARD_SIZE)
    .offset(shard * SHARD_SIZE);

  let lastModified = new Date(0);
  const urls = rows
    .map((r) => {
      if (r.publishedAt > lastModified) lastModified = r.publishedAt;
      const loc = `${origin}/${r.locale}${r.path === '/' ? '' : r.path}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${r.publishedAt.toISOString()}</lastmod>\n  </url>`;
    })
    .join('\n');

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    lastModified,
  };
}
