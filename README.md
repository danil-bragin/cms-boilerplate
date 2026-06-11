# CMS Boilerplate

Production-grade, self-hosted CMS boilerplate built for **high read load**:
visual page editing with [Puck](https://puckeditor.com), a Next.js render layer
with a **shared Redis ISR cache across replicas**, a NestJS content API, BullMQ
media workers, Keycloak OIDC auth and S3 + imgproxy media.

```
                        ┌────────────────────────── write path ──────────────────────────┐
  editors ── /admin ──► Next.js (Puck editor) ──► NestJS API ──► Postgres (drafts/versions)
                                                      │ publish = tx snapshot → published_pages
                                                      ▼
                                          revalidateTag (HMAC) ──► every web replica
                        ┌────────────────────────── read path ───────────────────────────┐
  visitors ── CDN ──►  Next.js replicas ──► shared Redis cache ──► 1-row read of published_pages
  images   ── CDN ──►  imgproxy ──► S3
```

## Stack

| Layer | Choice |
|---|---|
| Render | Next.js 16 (App Router, standalone) + `@trieb.work/nextjs-turbo-redis-cache` |
| Editor | `@puckeditor/core` 0.21 (pinned minor), split RSC render / client editor configs |
| API | NestJS 11, Zod v4 contracts (`nestjs-zod`), jose JWKS auth guard |
| Data | Postgres 17 + Drizzle ORM, append-only versions, denormalized published snapshots |
| Queue | BullMQ (`media-process`, `invalidation` retry) |
| Auth | Keycloak 26 (OIDC code+PKCE on web, bearer JWT on api), roles `cms-admin/editor/viewer` |
| Media | Presigned PUT → S3/MinIO → worker (sharp probe, blurhash, EXIF strip) → imgproxy serving |
| Monorepo | Turborepo + pnpm; apps `web/api/worker`, packages `db/contracts/auth/puck-config` |

## Quickstart

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d     # PG :5433, Redis :6380, MinIO :9000, Keycloak :8080, imgproxy :8081
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                                             # web :3000, api :3001, worker
```

- Public demo page: http://localhost:3000/en
- Admin: http://localhost:3000/admin — `editor@cms.local` / `editor`
  (also `admin@cms.local`/`admin`, `viewer@cms.local`/`viewer`)
- Keycloak console: http://localhost:8080 — `admin`/`admin`

## How the high-load read path works

Built around "write rarely, read constantly": cache everything forever,
invalidate exactly what changed on publish.

1. `src/proxy.ts` resolves Host → site from an **in-process map** (30s TTL,
   stale-while-refresh — a Map lookup, no DB/Redis on the hot path) and
   rewrites `/en/about` → `/s/{siteId}/en/about`. Unknown hosts and unknown
   locales are refused in the proxy before any rendering.
2. The internal route is **full-page ISR** (`revalidate = false`, empty
   `generateStaticParams`): the first request renders from a **one-row read**
   of `published_pages` (denormalized JSONB snapshot); the rendered HTML is
   cached in **Redis shared by all replicas**. A cache hit serves prerendered
   HTML — `x-nextjs-cache: HIT`, zero React work, ~1ms per request
   (≈1,200 RPS on a single laptop process, p99 67ms @ c=50).
3. Pages are emitted with `Cache-Control: s-maxage=31536000` — a CDN in front
   caches HTML too and absorbs most traffic before it reaches the pods.
4. Publishing (Nest API) writes the snapshot transactionally, then calls
   `POST /api/revalidate` (HMAC-signed) which runs
   `revalidateTag(tag, { expire: 0 })` — hard invalidation, **read-your-writes**,
   propagated to every replica through the shared Redis cache. Sibling locales
   and the hreflang data are invalidated together. Failures are retried from a
   BullMQ queue; pages are stale-until-retry, never wrong.
5. CDN purge is an extension point: `RevalidateClient` in
   `apps/api/src/publish/revalidate.client.ts`.

Postgres is touched only on cache fill (first hit after publish) — steady-state
read traffic is served entirely from Redis/CDN, so DB sizing follows editor
activity, not visitor traffic.

Images are never resized in the Node process: the worker strips EXIF and
pre-computes dimensions/blurhash at upload; serving goes through imgproxy with
signed URLs. The editor canvas uses an authenticated `/api/media/...` proxy
route so signing keys never reach the browser.

## Content model

```
sites ─► pages ─► page_locales ─► page_versions (append-only, draft/published/archived)
                       │
                       └─ publish = upsert into published_pages (site, locale, path → snapshot)
```

- A page groups locales; the site's default locale is created with the page,
  other locales are added per page as they get translated.
- Every locale has an independent draft/publish lifecycle and its own Puck payload.
- Rollback = publish an older version. Optimistic concurrency on autosave
  (`baseVersionNo` → 409 on conflict).
- `page_versions.schema_version` + Puck's `migrate()`/`transformProps()` are the
  upgrade path when component props change shape.

## Commands

| Command | What |
|---|---|
| `pnpm dev` | all apps in watch mode |
| `pnpm build / typecheck / test` | turbo across the workspace |
| `pnpm db:generate / db:migrate / db:seed` | drizzle-kit migrations + demo seed |
| `pnpm --filter api test` | API integration tests (Testcontainers: PG/Redis/MinIO) |
| `pnpm --filter e2e test` | Playwright smoke against the running dev stack |

## Deployment

Dockerfiles per app (`apps/*/Dockerfile`), reference Kubernetes manifests and
scaling notes in [`infra/k8s/`](infra/k8s/README.md). Key production rules:

- All web replicas share one Redis cache **with `notify-keyspace-events Exe`**;
  BullMQ needs its own Redis with `noeviction`.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` identical across web replicas.
- Size Postgres `max_connections` against replica count × pool size (10);
  add PgBouncer before adding replicas.
- API rate limiting is Redis-backed (`@nestjs/throttler`): 300 req/min/IP
  globally, 30/min on media presign — limits hold across replicas. Web traffic
  should be rate-limited at the CDN/WAF/ingress, not in Node.
- Design docs: [`docs/superpowers/specs/`](docs/superpowers/specs/),
  plan: [`docs/superpowers/plans/`](docs/superpowers/plans/).

## Observability

OpenTelemetry everywhere, off by default. Set `OTEL_EXPORTER_OTLP_ENDPOINT`
(api + worker: NodeSDK with http/express/pg/ioredis auto-instrumentation;
web: `@vercel/otel` via `instrumentation.ts`) and traces/metrics flow to any
OTLP collector. Local quickstart:

```bash
docker compose -f infra/docker-compose.yml --profile observability up -d jaeger
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm dev
# UI: http://localhost:16686
```

## SEO & indexing (built in)

Per page (all from the publish snapshot, all cached with the page HTML):
- `<html lang>` per locale; canonical + hreflang link tags incl. `x-default`
  (single channel — deliberately not duplicated in the sitemap).
- `robots: index, follow, max-snippet:-1, max-image-preview:large,
  max-video-preview:-1` (the `max-image-preview:large` directive feeds Google
  Discover and AI Overviews image previews).
- Open Graph (type, url, site_name, locale + alternates) + Twitter
  `summary_large_image`; **dynamic OG image** 1200×630 at `/og/{pageId}`
  (ImageResponse, immutable-cached, URL versioned by publish timestamp so
  scraper caches bust on republish).
- JSON-LD: `WebSite` + `WebPage` (real `dateModified`) + `BreadcrumbList`.
  No `SearchAction` (Google killed the sitelinks search box in 2024), no
  FAQ/HowTo rich-result chasing (removed by Google).

Per site (host-aware route handlers — the file conventions can't see Host):
- `/sitemap.xml` — real `lastmod` from `published_at` (Google only trusts
  accurate lastmod; `priority`/`changefreq` omitted — ignored). 
- `/robots.txt` — sitemap line + optional AI-training-bot block
  (`site.settings.seo.blockAiTraining`): blocks GPTBot/ClaudeBot/CCBot-class
  **training** scrapers only, never AI *search* indexers (OAI-SearchBot,
  Claude-SearchBot, PerplexityBot) — those drive citations in AI answers.
- **IndexNow**: per-site key (`/indexnow.txt`), worker pings
  `api.indexnow.org` on every publish/unpublish → near-real-time indexing in
  Bing/Yandex/Naver and the Bing-backed AI surfaces (ChatGPT search, Copilot).
  Google doesn't support IndexNow — the sitemap covers it.
- llms.txt intentionally omitted: ~0.1% AI-bot fetch rate, dismissed by Google.

## Speed (beyond the cache architecture)

- **Speculation Rules** (`moderate` eagerness): Chrome prefetches/prerenders
  links on hover/viewport — prerendered navigations land at p75 LCP ~320ms.
  Excluded: admin/api/preview. Progressive enhancement, 2-slot FIFO cap.
- Cross-document **View Transitions** (`@view-transition`) — animated MPA
  navigations, pure CSS, Chrome + Safari 18.2+.
- bfcache-clean: static HTML (no `no-store`), `Permissions-Policy: unload=()`.
- LCP images: editor-set `priority` flag → `loading=eager fetchpriority=high`;
  everything else lazy. `preconnect` to imgproxy in the document head.
- imgproxy negotiates **AVIF → WebP → original** via Accept header
  (`IMGPROXY_AUTO_AVIF/WEBP`); your CDN must cache with `Vary: Accept`.
- `next start` compresses with gzip only — front it with
  [`infra/nginx/nginx.conf`](infra/nginx/nginx.conf) (brotli_static for
  immutable assets, brotli/zstd for HTML, 103 Early Hints proxying for
  nginx ≥1.29.8) and set `compress: false`.
- Every response carries `Link: <imgproxy>; rel=preconnect` — CDNs
  (Cloudflare et al.) lift it into a 103 Early Hints response automatically.
- **React Compiler** is on (`reactCompiler: true`) — auto-memoizes the admin
  editor's client components.
- **Lighthouse CI** runs in the pipeline with hard budgets
  (perf ≥0.95, SEO ≥0.95, a11y ≥0.9, LCP ≤2.5s, CLS ≤0.1, TBT ≤200ms —
  current scores: 100/100/100, LCP ~460ms, CLS 0). `pnpm exec lhci autorun`
  locally against a running prod build.

### Why NOT `cacheComponents` (evaluated, rejected)

Attempted and reverted with evidence: this architecture serves **fully static
pages from a full-HTML Redis cache** — a hit costs zero React work. Under
`cacheComponents` the cacheable unit is the RSC payload, so every request
would still pay flight→HTML SSR rendering; root params demand build-time
sentinel values (no DB at image-build time), every dynamic admin route needs
Suspense restructuring, and the Redis cache handler's cacheComponents path
crashed (node-redis hScan API). Net effect for a no-dynamic-holes CMS page:
strictly slower and more fragile. Revisit only when pages grow per-request
dynamic islands (personalization, A/B).

**Dependency pin that matters:** `redis` is pinned to `4.7.0` in `apps/web` —
it is the peer of `@trieb.work/nextjs-turbo-redis-cache`; node-redis v5/v6
change the `hScan` cursor API and silently kill the cache handler (pages
permanently MISS). Do not bump it independently of the handler.

## RUM — field Core Web Vitals

Google ranks on **field** data (CrUX), not Lighthouse lab runs. Every public
page ships a ~2KB lazy `web-vitals` reporter (prerender/bfcache-correct —
required because Speculation Rules are on): LCP/INP/CLS/TTFB/FCP beacons to
`/api/vitals` (sampled via `NEXT_PUBLIC_VITALS_SAMPLE`, zero PII), recorded as
OTel histograms with CWV-aligned buckets, exported through the existing OTLP
pipeline. Grafana shows p75 per host against Google's thresholds plus a
worst-pages-by-LCP table. Path label is cardinality-capped (500/replica →
`_other`).

## Abuse resistance on the read path

- Unknown hosts, unknown locales and **unpublished paths are refused in the
  proxy** (~1ms, in-memory set of published paths, 5s TTL stale-while-refresh) —
  scanners never reach the renderer and cannot grow the page cache.
- Trade-off: a freshly published page may 404 for ≤5s on a replica that has not
  refreshed its path set yet. Lower `PATHS_TTL_MS` in `src/proxy.ts` if needed.
- Cache stampede after invalidation is bounded by design: Next coalesces
  concurrent renders per path in-process, so a publish costs at most one
  render per replica, each a single-row Postgres read.
