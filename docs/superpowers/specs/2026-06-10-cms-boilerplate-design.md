# CMS Boilerplate — Design

Date: 2026-06-10
Status: Approved

## Purpose

Production-grade boilerplate for a high-read-load CMS: visual page editing with Puck,
published pages served by Next.js behind an aggressive shared cache, content/media/auth
managed by a NestJS API. Self-hosted (Docker/Kubernetes), horizontally scalable.

## Usage model

- Public sites, read-heavy. High load = public page traffic (thousands of RPS via
  CDN + Redis-backed ISR). Editors are few.
- Multi-site: one installation serves multiple sites (domain → site resolution).
- Multi-locale: one `page` entity groups locales; default locale created with the
  page, other locales added per page as translated. Each locale has its own Puck
  payload and its own independent draft/publish lifecycle.
  URLs: `/{locale}/{path}`, optional per-locale slug override. hreflang alternates
  generated from sibling locales.

## Stack (researched 2026-06-10)

| Concern | Pick | Why |
|---|---|---|
| Render | Next.js 16.2, App Router, standalone output | 15 is EOL Oct 2026; 16 ~2x renderer throughput |
| Editor | `@puckeditor/core` 0.21.x (pinned minor) | `@measured/puck` frozen; pre-1.0, minors break |
| API | NestJS 11 | write-path, media, publish, invalidation |
| ORM | Drizzle (latest stable) | plain-TS schema in shared package, no codegen |
| Shared ISR cache | `@trieb.work/nextjs-turbo-redis-cache` | alive, built for high load: batched tag invalidation, request dedup; revalidateTag propagates to all replicas via shared Redis |
| Queue | BullMQ + `@nestjs/bullmq` | media jobs; BullMQ brings its own ioredis |
| Redis client (app) | node-redis v6 | ioredis in maintenance mode |
| Images | imgproxy (S3 source, signed URLs) | never resize in the Node process |
| Auth | Keycloak (OIDC). Next: `openid-client` v6 code+PKCE, encrypted httpOnly cookie. Nest: `jose` JWKS guard | Auth.js v5 frozen; Keycloak is sole user store |
| Contracts | Zod v4 in `packages/contracts`, `nestjs-zod` pipes | one schema source for both apps |
| Monorepo | Turborepo + pnpm workspaces | 3 apps + 4 packages, zero-config |
| Storage | S3-compatible (MinIO in dev) | presigned PUT uploads |

Known Puck constraints (drive the design):
- Editor component only — no pages/versions/media/users. Persistence is ours.
- RSC-safe `<Render>`; legacy `DropZone` not RSC-compatible — slot fields only.
- No built-in i18n — per-locale Data payload (our model).
- `migrate()`/`transformProps()` exist but no version tracking — we store
  `schema_version` per page version.
- `<Puck>` `data` prop is initial-only (uncontrolled) — remount via key on switch.
- Editor bundle heavy — load on `/admin` client route only; public pages use `<Render>`.

## Architecture

Monorepo:

```
apps/
  web        Next.js 16 — public render + /admin (Puck editor)
  api        NestJS 11 — content API, publish, media, invalidation
  worker     BullMQ worker (NestJS standalone entrypoint) — media processing
packages/
  db           Drizzle schema + client
  contracts    Zod v4 API schemas + inferred types
  puck-config  Puck components: split editor/render configs (RSC-safe render)
  auth         jose JWKS validation + role mapping (shared web/api)
infra/
  docker-compose: Postgres, Redis, MinIO, Keycloak (realm import), imgproxy
  k8s/ reference manifests
```

### Read path (the high-load path)

```
CDN → Next pod → shared Redis ISR cache → miss: single-row read of
published_pages from Postgres (Drizzle, no API hop) → <Render>
```

- Catch-all route `app/[locale]/[[...path]]/page.tsx`, cache tag
  `page:{siteId}:{locale}:{path}`.
- Host → site resolution in Next proxy/middleware.
- Published content is a denormalized snapshot: one JSONB row per
  (site, locale, path). Read path never assembles a page from parts.
- `cacheMaxMemorySize: 0`; all replicas share the Redis cache, so one
  `revalidateTag` call invalidates everywhere. CDN purge exposed as an
  interface with a no-op default.

### Write path

```
Puck editor (/admin in apps/web) → Nest API → page_versions (drafts)
publish → tx: version.status=published + upsert published_pages
        → after commit: revalidateTag + CDN purge hook
```

- Preview: `/preview/{versionId}` — same `<Render>`, behind auth, `no-store`.
- Unpublish = delete from published_pages + invalidate.
- Rollback = publish an older version (append-only history).

## Data model

```
sites            id, slug, domains[], default_locale, locales[], settings jsonb
pages            id, site_id, path, name                      unique(site_id, path)
page_locales     id, page_id, locale, slug_override?          unique(page_id, locale)
                 — row exists = locale added; default locale created with page
page_versions    id, page_locale_id, version_no, puck_data jsonb, schema_version,
                 status(draft|published|archived), created_by, created_at
                 — append-only
published_pages  site_id, locale, path, page_id, version_id, puck_data jsonb,
                 seo jsonb, published_at                      unique(site_id, locale, path)
media            id, site_id, s3_key, mime, size, width, height, blurhash,
                 alt jsonb(per-locale), status(uploading|ready|failed), created_by
users            id(=Keycloak sub), email, display_name — lazy-synced mirror,
                 FK target for created_by
```

## Auth + RBAC

- Keycloak realm shipped via realm-import JSON in compose: clients `cms-web`
  (public, PKCE) and `cms-api` (bearer-only), realm roles
  `cms-admin | cms-editor | cms-viewer`.
- Next: openid-client v6 code+PKCE in route handlers; tokens in encrypted
  httpOnly cookie; auto refresh; `/admin/*` guarded.
- Nest: jose `createRemoteJWKSet` + `jwtVerify` (issuer + audience), guard +
  `@Roles()` decorator. No passport.
- Role → Puck Permissions API mapping (viewer = read-only editor) and Nest RBAC,
  both from `packages/auth`.

## Media pipeline

1. Admin requests upload → Nest issues presigned PUT, inserts `media(status=uploading)`.
2. Browser uploads directly to S3/MinIO (bypasses API).
3. Confirm → BullMQ job: probe dimensions/mime, blurhash, EXIF strip → `status=ready`.
4. Serving: imgproxy signed URLs from S3; custom `next/image` loader; Puck custom
   `image` field opens the media library.

## Error handling

- All API I/O validated by Zod v4 contracts (nestjs-zod pipes); 4xx with typed
  error body.
- Publish is transactional; cache invalidation runs after commit; invalidation
  failure logged + retried via BullMQ (page stays correct in DB; stale-until-retry).
- Media jobs retry with backoff; terminal failure → `media.status=failed`, visible
  in admin.
- Read path: missing published row → 404; Redis down → degrade to direct DB read
  (handler falls through), not an outage.

## Testing

- Unit: Vitest everywhere (web, api, packages).
- Integration: Testcontainers (Postgres + Redis + MinIO) for the Nest API —
  publish flow, invalidation, presigned upload lifecycle.
- E2E: Playwright smoke — login → create page → add component → publish →
  public page serves.
- CI: GitHub Actions — lint, typecheck, unit, integration, build.

## DX

- `docker compose up` brings up PG, Redis, MinIO, Keycloak (realm imported),
  imgproxy. `pnpm dev` = turbo dev for web + api + worker.
- Seed script: demo site, 2 locales, demo pages, demo media.
- `.env.example` per app; single source `infra/env.md` documenting every variable.

## Out of scope (v1)

- Scheduled publishing, webhooks/outbound events, full-text search, A/B testing,
  editor real-time collaboration, billing/tenant self-service (multi-site is
  admin-managed, not SaaS self-serve).
