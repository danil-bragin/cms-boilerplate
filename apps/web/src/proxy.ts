import { NextResponse, type NextRequest } from 'next/server';
import { createDb, sites, type Db } from '@cms/db';

/**
 * Host → site resolution on the hot path.
 *
 * Public pages are served from a full-page ISR cache keyed by the rewritten
 * internal URL /s/{siteId}/{locale}/{path}. The page component itself never
 * reads request headers, so Next can cache the rendered HTML in the shared
 * Redis cache handler — a cache hit costs zero React rendering on any replica.
 *
 * The site map lives in process memory with a short TTL: sites change rarely,
 * the map is tiny, and this keeps the per-request overhead at a Map lookup
 * instead of a Postgres/Redis roundtrip.
 */

const SITE_MAP_TTL_MS = 30_000;

interface SiteEntry {
  id: string;
  defaultLocale: string;
  locales: string[];
}

let cached: { map: Map<string, SiteEntry>; expiresAt: number } | null = null;
let refreshing: Promise<Map<string, SiteEntry>> | null = null;

const globalForDb = globalThis as unknown as { __proxyDb?: Db };

function db(): Db {
  if (!globalForDb.__proxyDb) {
    globalForDb.__proxyDb = createDb(process.env.DATABASE_URL ?? '', { max: 2 });
  }
  return globalForDb.__proxyDb;
}

async function loadSiteMap(): Promise<Map<string, SiteEntry>> {
  const rows = await db().select().from(sites);
  const map = new Map<string, SiteEntry>();
  for (const row of rows) {
    for (const domain of row.domains) {
      map.set(domain, { id: row.id, defaultLocale: row.defaultLocale, locales: row.locales });
    }
  }
  return map;
}

async function siteMap(): Promise<Map<string, SiteEntry>> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.map;
  // serve stale while one refresh is in flight — never stampede the DB
  if (cached && refreshing) return cached.map;
  refreshing ??= loadSiteMap()
    .then((map) => {
      cached = { map, expiresAt: Date.now() + SITE_MAP_TTL_MS };
      return map;
    })
    .finally(() => {
      refreshing = null;
    });
  if (cached) return cached.map;
  return refreshing;
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // internal namespace must not be reachable from outside
  if (pathname.startsWith('/s/') || pathname === '/s') {
    return new NextResponse('Not found', { status: 404 });
  }

  const host = (req.headers.get('host') ?? '').split(':')[0] ?? '';
  const site = (await siteMap()).get(host);
  if (!site) {
    // unknown host: refuse before any rendering — keeps scanners out of the page cache
    return new NextResponse('Not found', { status: 404 });
  }

  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = `/${site.defaultLocale}`;
    return NextResponse.redirect(url, 307);
  }

  const locale = pathname.split('/')[1] ?? '';
  if (!site.locales.includes(locale)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const url = req.nextUrl.clone();
  url.pathname = `/s/${site.id}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // public traffic only — admin/api/preview/static assets bypass the rewrite
  matcher: ['/((?!_next|api|admin|preview|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)'],
};
