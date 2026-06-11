import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { publishedPages } from '@cms/db';
import { resolveSiteByHost } from '@/lib/site-resolver';
import { db } from '@/lib/db';

/**
 * Public full-text search over published content (host-aware).
 * `websearch_to_tsquery` accepts user-style queries ("foo -bar", quoted phrases);
 * GIN index on to_tsvector('simple', search_text) keeps it fast.
 */
// per-replica sliding window: cheap brake on tsquery DoS; put a CDN/WAF rule
// in front for cluster-wide limits
const WINDOW_MS = 60_000;
const LIMIT = 30;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10_000) hits.clear();
  return false;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  const locale = req.nextUrl.searchParams.get('locale') ?? '';
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const site = await resolveSiteByHost(host);
  if (!site) return NextResponse.json({ results: [] }, { status: 404 });

  // two-phase: rank+limit against the GIN-indexed generated tsvector first,
  // then ts_headline only the 20 survivors (headline re-parses text — expensive)
  const tsquery = sql`websearch_to_tsquery('simple', ${q})`;
  const rows = await db().execute<{
    path: string;
    locale: string;
    seo: { title?: string };
    snippet: string;
  }>(sql`
    WITH ranked AS (
      SELECT path, locale, seo, search_text,
             ts_rank(search_vector, ${tsquery}) AS rank
      FROM published_pages
      WHERE site_id = ${site.id}
        ${locale ? sql`AND locale = ${locale}` : sql``}
        AND search_vector @@ ${tsquery}
      ORDER BY rank DESC
      LIMIT 20
    )
    SELECT path, locale, seo,
           ts_headline('simple', search_text, ${tsquery},
             'MaxWords=30, MinWords=15, MaxFragments=1') AS snippet
    FROM ranked
  `);

  return NextResponse.json(
    {
      results: rows.map((r) => ({
        url: `/${r.locale}${r.path === '/' ? '' : r.path}`,
        title: r.seo?.title ?? '',
        snippet: r.snippet,
        locale: r.locale,
      })),
    },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
