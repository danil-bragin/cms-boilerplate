import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { publishedPages, sites } from '@cms/db';
import { db } from '@/lib/db';

/**
 * Public full-text search over published content (host-aware).
 * `websearch_to_tsquery` accepts user-style queries ("foo -bar", quoted phrases);
 * GIN index on to_tsvector('simple', search_text) keeps it fast.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 200);
  const locale = req.nextUrl.searchParams.get('locale') ?? '';
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const allSites = await db().select().from(sites);
  const site = allSites.find((s) => s.domains.includes(host));
  if (!site) return NextResponse.json({ results: [] }, { status: 404 });

  const tsquery = sql`websearch_to_tsquery('simple', ${q})`;
  const rank = sql<number>`ts_rank(to_tsvector('simple', ${publishedPages.searchText}), ${tsquery})`;
  const rows = await db()
    .select({
      path: publishedPages.path,
      locale: publishedPages.locale,
      seo: publishedPages.seo,
      rank: rank.as('rank'),
      snippet: sql<string>`ts_headline('simple', ${publishedPages.searchText}, ${tsquery},
        'MaxWords=30, MinWords=15, MaxFragments=1')`.as('snippet'),
    })
    .from(publishedPages)
    .where(
      and(
        eq(publishedPages.siteId, site.id),
        locale ? eq(publishedPages.locale, locale) : undefined,
        sql`to_tsvector('simple', ${publishedPages.searchText}) @@ ${tsquery}`,
      ),
    )
    .orderBy(sql`${rank} DESC`)
    .limit(20);

  return NextResponse.json(
    {
      results: rows.map((r) => ({
        url: `/${r.locale}${r.path === '/' ? '' : r.path}`,
        title: (r.seo as { title?: string }).title ?? '',
        snippet: r.snippet,
        locale: r.locale,
      })),
    },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
