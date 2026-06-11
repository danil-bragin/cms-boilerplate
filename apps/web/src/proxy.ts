import { NextResponse, type NextRequest } from 'next/server';
import { createDb, publishedPages, redirects, sites, type Db } from '@cms/db';

/**
 * Host → site resolution and fast-404 on the hot path.
 *
 * Public pages are served from a full-page ISR cache keyed by the rewritten
 * internal URL /s/{siteId}/{locale}/{path}. The page component itself never
 * reads request headers, so Next can cache the rendered HTML in the shared
 * Redis cache handler — a cache hit costs zero React rendering on any replica.
 *
 * Two in-process maps, both refreshed stale-while-revalidate (never a stampede,
 * never a blocking refresh after first load):
 *
 * - site map (host → site), TTL 30s
 * - published path set ("{siteId}:{locale}:{path}"), TTL 5s — requests for
 *   unknown paths are refused HERE, before any rendering, so scanners cannot
 *   grow the page cache with 404 entries. The unique index on
 *   published_pages(site_id, locale, path) makes the refresh an index-only scan.
 *
 * Trade-off: a freshly published page can 404 for up to PATHS_TTL_MS on a
 * replica that hasn't refreshed yet. 5s is invisible to editors in practice;
 * lower it if it ever matters. Refresh failures fail OPEN (requests render).
 */

const SITE_MAP_TTL_MS = 30_000;
const PATHS_TTL_MS = 5_000;

interface SiteEntry {
  id: string;
  defaultLocale: string;
  locales: string[];
  /** settings.localeFallback: redirect untranslated paths to the default locale */
  localeFallback: boolean;
}

const globalForDb = globalThis as unknown as { __proxyDb?: Db };

function db(): Db {
  if (!globalForDb.__proxyDb) {
    globalForDb.__proxyDb = createDb(process.env.DATABASE_URL ?? '', { max: 2 });
  }
  return globalForDb.__proxyDb;
}

interface Swr<T> {
  value: T | null;
  expiresAt: number;
  refreshing: Promise<T> | null;
}

function swrCell<T>(load: () => Promise<T>, ttlMs: number): () => Promise<T | null> {
  const cell: Swr<T> = { value: null, expiresAt: 0, refreshing: null };
  return async () => {
    const now = Date.now();
    if (cell.value !== null && cell.expiresAt > now) return cell.value;
    cell.refreshing ??= load()
      .then((v) => {
        cell.value = v;
        cell.expiresAt = Date.now() + ttlMs;
        return v;
      })
      .catch(() => {
        // fail open: keep serving the stale value, retry on the next request
        cell.expiresAt = Date.now() + 1_000;
        return cell.value as T;
      })
      .finally(() => {
        cell.refreshing = null;
      });
    // stale value present → serve it while the refresh runs in the background
    if (cell.value !== null) return cell.value;
    return cell.refreshing;
  };
}

const siteMap = swrCell(async () => {
  const rows = await db().select().from(sites);
  const map = new Map<string, SiteEntry>();
  for (const row of rows) {
    const settings = row.settings as { localeFallback?: boolean };
    for (const domain of row.domains) {
      map.set(domain, {
        id: row.id,
        defaultLocale: row.defaultLocale,
        locales: row.locales,
        localeFallback: Boolean(settings.localeFallback),
      });
    }
  }
  return map;
}, SITE_MAP_TTL_MS);

const redirectMap = swrCell(async () => {
  const rows = await db()
    .select({ siteId: redirects.siteId, fromPath: redirects.fromPath, toPath: redirects.toPath, status: redirects.status })
    .from(redirects);
  return new Map(rows.map((r) => [`${r.siteId}:${r.fromPath}`, { to: r.toPath, status: r.status }]));
}, PATHS_TTL_MS);

const publishedPaths = swrCell(async () => {
  const rows = await db()
    .select({
      siteId: publishedPages.siteId,
      locale: publishedPages.locale,
      path: publishedPages.path,
    })
    .from(publishedPages);
  return new Set(rows.map((r) => `${r.siteId}:${r.locale}:${r.path}`));
}, PATHS_TTL_MS);

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // internal namespace must not be reachable from outside
  if (pathname.startsWith('/s/') || pathname === '/s') {
    return new NextResponse('Not found', { status: 404 });
  }

  // canonical URL normalization: lowercase + no trailing slash. Mixed-case and
  // slashed variants 301 to one canonical form instead of 404 — kills
  // duplicate-URL signals at the edge before any rendering
  const canonical =
    pathname === '/' ? '/' : pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (canonical !== pathname) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }

  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const sites = await siteMap();
  if (!sites) {
    // cold start with the DB down: we genuinely don't know the host — say so
    return new NextResponse('Service unavailable', { status: 503, headers: { 'retry-after': '5' } });
  }
  const site = sites.get(host);
  if (!site) {
    return new NextResponse('Not found', { status: 404 });
  }

  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = `/${site.defaultLocale}`;
    return NextResponse.redirect(url, 308); // permanent: locale-prefix is the canonical home
  }

  // editor-managed redirects win over everything (path moves, vanity URLs)
  const redirectsByPath = await redirectMap();
  const redirect = redirectsByPath?.get(`${site.id}:${pathname}`);
  if (redirect) {
    const target = redirect.to.startsWith('http')
      ? redirect.to
      : new URL(redirect.to, req.nextUrl.origin).toString();
    return NextResponse.redirect(target, redirect.status === '301' ? 308 : 307);
  }

  const segments = pathname.split('/');
  const locale = segments[1] ?? '';
  if (!site.locales.includes(locale)) {
    return new NextResponse('Not found', { status: 404 });
  }

  // author archive pages are not in published_pages — let them through to the rewrite
  const isAuthorPage = segments[2] === 'author' && segments.length === 4;

  // fast-404: refuse unpublished paths before rendering (fail open on null)
  const paths = isAuthorPage ? null : await publishedPaths();
  if (paths) {
    const pagePath = '/' + segments.slice(2).join('/');
    const normalized = pagePath === '/' ? '/' : pagePath.replace(/\/$/, '');
    if (!paths.has(`${site.id}:${locale}:${normalized}`)) {
      // optional fallback: untranslated page exists in the default locale → redirect
      if (
        site.localeFallback &&
        locale !== site.defaultLocale &&
        paths.has(`${site.id}:${site.defaultLocale}:${normalized}`)
      ) {
        const url = req.nextUrl.clone();
        url.pathname = `/${site.defaultLocale}${normalized === '/' ? '' : normalized}`;
        return NextResponse.redirect(url, 307);
      }
      return new NextResponse('Not found', { status: 404 });
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = `/s/${site.id}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // public traffic only — admin/api/preview/seo endpoints/static assets bypass the rewrite
  matcher: [
    '/((?!_next|api|admin|preview|og|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|news-sitemap\\.xml|sitemaps|indexnow\\.txt|feed\\.xml).*)',
  ],
};
