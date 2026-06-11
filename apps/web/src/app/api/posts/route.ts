import { NextResponse, type NextRequest } from 'next/server';
import { resolveSiteByHost } from '@/lib/site-resolver';
import { getPostsPage } from '@/lib/posts';

export const dynamic = 'force-dynamic';

/** Paginated posts for the PostList client pagination. Discovery for crawlers is
 *  via the sitemap (lists every post) + RSS; this powers in-page UX paging. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const site = await resolveSiteByHost(host);
  if (!site) return NextResponse.json({ posts: [], totalPages: 1, page: 1 }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const locale = sp.get('locale') || site.defaultLocale;
  const page = Math.max(1, Math.min(1000, Number(sp.get('page') ?? '1') || 1));
  const perPage = Math.max(1, Math.min(50, Number(sp.get('perPage') ?? '10') || 10));

  const result = await getPostsPage(site.id, locale, page, perPage);
  return NextResponse.json(
    { posts: result.posts, page: result.page, totalPages: result.totalPages },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
