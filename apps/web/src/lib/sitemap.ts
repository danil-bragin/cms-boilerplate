import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { publishedPages } from '@cms/db';
import { imageUrl } from '@cms/puck-config';
import { db } from './db';

/** Collect image s3Keys from a Puck payload (Image blocks), bounded. */
function imageKeys(puckData: unknown, max = 100): string[] {
  const keys: string[] = [];
  const walk = (node: unknown): void => {
    if (keys.length >= max) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.type === 'Image') {
      const media = (obj.props as { media?: { s3Key?: string } } | undefined)?.media;
      if (media?.s3Key && !keys.includes(media.s3Key)) keys.push(media.s3Key);
    }
    for (const v of Object.values(obj)) if (typeof v === 'object' && v !== null) walk(v);
  };
  walk((puckData as { content?: unknown }).content);
  return keys;
}

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
      pageId: publishedPages.pageId,
      locale: publishedPages.locale,
      path: publishedPages.path,
      publishedAt: publishedPages.publishedAt,
      puckData: publishedPages.puckData,
    })
    .from(publishedPages)
    // exclude noindex pages from the sitemap
    .where(
      and(
        eq(publishedPages.siteId, siteId),
        sql`(${publishedPages.seo} ->> 'noindex') IS DISTINCT FROM 'true'`,
      ),
    )
    .orderBy(asc(publishedPages.publishedAt))
    .limit(SHARD_SIZE)
    .offset(shard * SHARD_SIZE);

  // group locales per page for hreflang xhtml:link alternates
  const byPage = new Map<string, Array<{ locale: string; path: string }>>();
  for (const r of rows) {
    const list = byPage.get(r.pageId) ?? [];
    list.push({ locale: r.locale, path: r.path });
    byPage.set(r.pageId, list);
  }

  let lastModified = new Date(0);
  const urls = rows
    .map((r) => {
      if (r.publishedAt > lastModified) lastModified = r.publishedAt;
      const loc = `${origin}/${r.locale}${r.path === '/' ? '' : r.path}`;
      const alts = byPage.get(r.pageId) ?? [];
      const links =
        alts.length > 1
          ? alts
              .map(
                (a) =>
                  `\n    <xhtml:link rel="alternate" hreflang="${a.locale}" href="${escapeXml(`${origin}/${a.locale}${a.path === '/' ? '' : a.path}`)}"/>`,
              )
              .join('')
          : '';
      const imgs = imageKeys(r.puckData)
        .map((key) => `\n    <image:image><image:loc>${escapeXml(imageUrl(key, { width: 1600 }))}</image:loc></image:image>`)
        .join('');
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${r.publishedAt.toISOString()}</lastmod>${links}${imgs}\n  </url>`;
    })
    .join('\n');

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`,
    lastModified,
  };
}
