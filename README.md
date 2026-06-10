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

## Abuse resistance on the read path

- Unknown hosts, unknown locales and **unpublished paths are refused in the
  proxy** (~1ms, in-memory set of published paths, 5s TTL stale-while-refresh) —
  scanners never reach the renderer and cannot grow the page cache.
- Trade-off: a freshly published page may 404 for ≤5s on a replica that has not
  refreshed its path set yet. Lower `PATHS_TTL_MS` in `src/proxy.ts` if needed.
- Cache stampede after invalidation is bounded by design: Next coalesces
  concurrent renders per path in-process, so a publish costs at most one
  render per replica, each a single-row Postgres read.
