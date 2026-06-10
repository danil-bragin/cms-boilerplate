# CMS Boilerplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production-grade, self-hosted, high-read-load CMS boilerplate: Puck visual editor, Next.js 16 render layer with shared Redis ISR cache, NestJS content/media API, BullMQ worker, Keycloak OIDC, S3 + imgproxy media.

**Architecture:** Turborepo monorepo. Read path: CDN → Next pod → shared Redis cache → single-row Postgres read of denormalized `published_pages` snapshot. Write path: Puck editor → Nest API → append-only `page_versions` → transactional publish → `revalidateTag` via signed internal Next endpoint (propagates to all replicas through the shared Redis cache handler).

**Tech Stack:** Next.js 16.2, `@puckeditor/core` 0.21.x (pinned), NestJS 11, Drizzle ORM + Postgres 17, `@trieb.work/nextjs-turbo-redis-cache`, BullMQ + `@nestjs/bullmq`, node-redis v6, Zod v4 + nestjs-zod, openid-client v6 (web) + jose (api), sharp + blurhash (worker), imgproxy, MinIO, Keycloak 26, Turborepo + pnpm, Vitest + Testcontainers + Playwright. Node 22, pnpm 10.

**Reference:** spec at `docs/superpowers/specs/2026-06-10-cms-boilerplate-design.md`.

**Conventions for all tasks:**
- Workspace root: `/Users/npden4ik/Projects/cms-boilerplate`.
- TS strict everywhere; ESM (`"type": "module"`) in packages; NodeNext resolution.
- Pin `@puckeditor/core` with `~` (minor pinned).
- Commit at the end of every task with the message given in the task.
- After every task: `pnpm turbo typecheck build --filter=<changed>` must pass.

---

## Phase 0 — Monorepo scaffold

### Task 0.1: Root workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`, `.npmrc`

- [ ] **Step 1: Write root files**

`package.json`:
```json
{
  "name": "cms-boilerplate",
  "private": true,
  "packageManager": "pnpm@10.12.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "db:generate": "pnpm --filter @cms/db generate",
    "db:migrate": "pnpm --filter @cms/db migrate",
    "db:seed": "pnpm --filter @cms/db seed"
  },
  "devDependencies": {
    "turbo": "^2.9.0",
    "typescript": "^5.8.0",
    "prettier": "^3.5.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```

`turbo.json`:
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`.nvmrc`: `22`
`.npmrc`: `shamefully-hoist=false`
`.gitignore`: node_modules, dist, .next, .turbo, .env, coverage, playwright-report, test-results, *.tsbuildinfo, .DS_Store

- [ ] **Step 2: `pnpm install`, verify `pnpm turbo --version` works**
- [ ] **Step 3: Commit** `chore: scaffold turborepo workspace`

### Task 0.2: Shared packages skeletons

**Files:**
- Create: `packages/{db,contracts,puck-config,auth}/package.json`, `…/tsconfig.json`, `…/src/index.ts`

- [ ] **Step 1:** Each package: name `@cms/<name>`, `"type": "module"`, `main`/`types` → `dist`, `exports` map, scripts `build: tsc -b`, `typecheck: tsc --noEmit`, `test: vitest run`. tsconfig extends base, `outDir: dist`, `rootDir: src`. Empty `src/index.ts` placeholder export.
- [ ] **Step 2:** `pnpm install && pnpm turbo build` → green.
- [ ] **Step 3: Commit** `chore: add shared package skeletons`

---

## Phase 1 — Infra (docker compose)

### Task 1.1: docker-compose + env

**Files:**
- Create: `infra/docker-compose.yml`, `infra/keycloak/realm-cms.json`, `infra/env.md`, `.env.example`

- [ ] **Step 1: Compose services** (all with healthchecks, named volumes):
  - `postgres` postgres:17-alpine, port 5432, db/user/pass `cms`
  - `redis` redis:7-alpine, port 6379, `--maxmemory-policy noeviction` (BullMQ requirement)
  - `minio` minio/minio, ports 9000/9001, + one-shot `minio-init` service (mc) creating bucket `cms-media` with public-read policy off
  - `keycloak` quay.io/keycloak/keycloak:26.2, `start-dev --import-realm`, port 8080, mounts `./keycloak:/opt/keycloak/data/import`
  - `imgproxy` ghcr.io/imgproxy/imgproxy:v4, port 8081→8080, env: `IMGPROXY_USE_S3=true`, `IMGPROXY_S3_ENDPOINT=http://minio:9000`, AWS creds = minio creds, `IMGPROXY_KEY`/`IMGPROXY_SALT` hex pair
- [ ] **Step 2: Keycloak realm import JSON** — realm `cms`; realm roles `cms-admin`, `cms-editor`, `cms-viewer`; client `cms-web` (public, standardFlow, PKCE S256, redirectUris `http://localhost:3000/*`, webOrigins `+`); client `cms-api` (bearerOnly); users `admin@cms.local`/`admin` (cms-admin) and `editor@cms.local`/`editor` (cms-editor), password non-temporary. Audience mapper on `cms-web`: include `cms-api` in `aud`.
- [ ] **Step 3: `.env.example`** — DATABASE_URL, REDIS_URL, S3_* (endpoint, region, bucket, keys, forcePathStyle=true), KEYCLOAK_ISSUER=`http://localhost:8080/realms/cms`, KEYCLOAK_WEB_CLIENT_ID, KEYCLOAK_API_AUDIENCE, SESSION_SECRET (32B), REVALIDATE_SECRET (32B), IMGPROXY_URL/KEY/SALT, NEXT_PUBLIC_* variants. `infra/env.md` documents each var.
- [ ] **Step 4:** `docker compose -f infra/docker-compose.yml up -d` → all healthy; `curl http://localhost:8080/realms/cms/.well-known/openid-configuration` → 200.
- [ ] **Step 5: Commit** `feat(infra): compose stack with keycloak realm, minio, imgproxy`

---

## Phase 2 — `@cms/db` (Drizzle schema + migrations + seed)

### Task 2.1: Schema

**Files:**
- Create: `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/index.ts`, `packages/db/drizzle.config.ts`

- [ ] **Step 1: Schema per spec** (complete):

```ts
// packages/db/src/schema.ts
import { pgTable, uuid, text, jsonb, integer, bigint, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const versionStatus = pgEnum('version_status', ['draft', 'published', 'archived']);
export const mediaStatus = pgEnum('media_status', ['uploading', 'ready', 'failed']);

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  domains: text('domains').array().notNull().default([]),
  defaultLocale: text('default_locale').notNull(),
  locales: text('locales').array().notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(), // keycloak sub
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  path: text('path').notNull(), // normalized: leading '/', no trailing '/'
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('pages_site_path_uq').on(t.siteId, t.path)]);

export const pageLocales = pgTable('page_locales', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  locale: text('locale').notNull(),
  slugOverride: text('slug_override'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('page_locales_page_locale_uq').on(t.pageId, t.locale)]);

export const pageVersions = pgTable('page_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageLocaleId: uuid('page_locale_id').notNull().references(() => pageLocales.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  puckData: jsonb('puck_data').notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  status: versionStatus('status').notNull().default('draft'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('page_versions_locale_no_uq').on(t.pageLocaleId, t.versionNo),
  index('page_versions_locale_idx').on(t.pageLocaleId),
]);

export const publishedPages = pgTable('published_pages', {
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  locale: text('locale').notNull(),
  path: text('path').notNull(),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().references(() => pageVersions.id),
  puckData: jsonb('puck_data').notNull(),
  seo: jsonb('seo').notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('published_pages_uq').on(t.siteId, t.locale, t.path),
  index('published_pages_page_idx').on(t.pageId),
]);

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  s3Key: text('s3_key').notNull().unique(),
  mime: text('mime').notNull().default(''),
  size: bigint('size', { mode: 'number' }).notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  blurhash: text('blurhash'),
  alt: jsonb('alt').notNull().default({}), // {[locale]: string}
  status: mediaStatus('status').notNull().default('uploading'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`client.ts`: `createDb(url)` → `drizzle(postgres(url))` via `postgres` (postgres.js driver); export type `Db`. `index.ts` re-exports schema + client.
- [ ] **Step 2:** deps: `drizzle-orm`, `postgres`; dev: `drizzle-kit`. `drizzle.config.ts`: dialect postgresql, schema path, out `./migrations`, url from env.
- [ ] **Step 3:** `pnpm --filter @cms/db generate` → migration SQL appears; `migrate` script (`drizzle-kit migrate`) applies against compose PG; verify `\dt` lists 7 tables.
- [ ] **Step 4: Commit** `feat(db): drizzle schema and initial migration`

### Task 2.2: Seed

**Files:**
- Create: `packages/db/src/seed.ts`

- [ ] **Step 1:** Seed: user `system` (id `system`), site `demo` (domains `["localhost"]`, defaultLocale `en`, locales `["en","de"]`), pages `/` and `/about` with `en` locale, draft version v1 with minimal Puck data (`{root:{props:{title:"Home"}},content:[],zones:{}}`), and `/` also published (insert into `published_pages`). Idempotent (upsert by unique keys).
- [ ] **Step 2:** `pnpm db:seed` runs clean twice.
- [ ] **Step 3: Commit** `feat(db): seed script`

---

## Phase 3 — `@cms/contracts` (Zod v4)

### Task 3.1: Contracts

**Files:**
- Create: `packages/contracts/src/{puck-data,pages,publish,media,errors}.ts`, `src/index.ts`
- Test: `packages/contracts/src/__tests__/contracts.test.ts`

- [ ] **Step 1 (TDD):** failing tests: PuckData accepts minimal valid payload, rejects non-object content items; `createPageBody` rejects path without leading slash; `presignBody` rejects disallowed mime.
- [ ] **Step 2: Implement** — zod v4. Key schemas:
  - `puckDataSchema`: `{ root: z.looseObject({}), content: z.array(z.looseObject({ type: z.string(), props: z.looseObject({ id: z.string() }) })), zones: z.record(z.string(), z.array(z.looseObject({}))).optional() }`
  - `pathSchema`: `z.string().regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/)`
  - pages: `createPageBody {siteId, path, name}`, `addLocaleBody {locale}`, `saveDraftBody {puckData, baseVersionNo?}`, responses with inferred drizzle-shaped DTOs (id, path, locales summary: locale + latest versionNo + publishedVersionNo?)
  - publish: `publishBody {versionId}`, `publishResult {versionId, publishedAt}`
  - media: `presignBody {siteId, filename, mime: z.enum([...IMAGE_MIMES]), size: z.number().max(25*1024*1024)}`, `presignResult {mediaId, uploadUrl, s3Key}`, `confirmBody {mediaId}`
  - errors: `apiError {code, message, details?}`
- [ ] **Step 3:** tests pass. **Commit** `feat(contracts): zod v4 api contracts`

---

## Phase 4 — `@cms/auth` (jose verification + roles)

### Task 4.1: Token verification

**Files:**
- Create: `packages/auth/src/{verify,roles}.ts`, `src/index.ts`
- Test: `packages/auth/src/__tests__/verify.test.ts`

- [ ] **Step 1 (TDD):** tests using a locally generated RS256 keypair (`jose.generateKeyPair`) and `createLocalJWKSet`: valid token → claims; wrong issuer → throws; expired → throws; missing audience → throws; `extractRoles` reads `realm_access.roles` and filters to `cms-*`.
- [ ] **Step 2: Implement:**

```ts
// packages/auth/src/verify.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type CmsRole = 'cms-admin' | 'cms-editor' | 'cms-viewer';
export interface AuthContext { sub: string; email: string; name: string; roles: CmsRole[] }

export function createVerifier(opts: {
  issuer: string;
  audience: string;
  jwks?: Parameters<typeof jwtVerify>[1]; // injectable for tests
}) {
  const jwks = opts.jwks ?? createRemoteJWKSet(new URL(`${opts.issuer}/protocol/openid-connect/certs`));
  return async function verifyAccessToken(token: string): Promise<AuthContext> {
    const { payload } = await jwtVerify(token, jwks, { issuer: opts.issuer, audience: opts.audience });
    return { sub: payload.sub!, email: (payload.email as string) ?? '', name: (payload.name as string) ?? '', roles: extractRoles(payload) };
  };
}

export function extractRoles(payload: JWTPayload): CmsRole[] {
  const realm = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
  return realm.filter((r): r is CmsRole => r.startsWith('cms-'));
}
```
`roles.ts`: `canEdit(roles)`, `canPublish(roles)` (admin|editor), `puckPermissionsFor(roles)` → `{ edit, insert, delete, drag, duplicate }` all false for viewer.
- [ ] **Step 3:** tests pass. **Commit** `feat(auth): jose keycloak token verification + role mapping`

---

## Phase 5 — `apps/api` (NestJS)

### Task 5.1: Nest scaffold + config + db provider + auth guard

**Files:**
- Create: `apps/api/src/{main.ts,app.module.ts}`, `src/config/config.ts`, `src/db/db.module.ts`, `src/auth/{auth.guard.ts,roles.decorator.ts,current-user.decorator.ts}`, `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`

- [ ] **Step 1:** Manual Nest 11 setup (no CLI scaffold noise): deps `@nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs nestjs-zod`, workspace deps `@cms/{db,contracts,auth}`. Config via plain zod-validated `process.env` loader (`config.ts`, fail-fast). `DbModule` provides `DB` token via `createDb(cfg.databaseUrl)`. Global `ZodValidationPipe` from nestjs-zod.
- [ ] **Step 2: AuthGuard** — global guard: Bearer token → `verifyAccessToken` from `@cms/auth`; attaches `AuthContext` to request; lazily upserts `users` row (insert on conflict update email/name) once per request when sub unseen (in-memory LRU of seen subs). `@Roles('cms-editor')` decorator + reflector check. `@Public()` decorator for health.
- [ ] **Step 3:** `GET /health` public endpoint → `{ok:true}`. App boots: `pnpm --filter api dev`, curl health → 200; curl without token to `/sites` → 401.
- [ ] **Step 4: Commit** `feat(api): nest scaffold, zod config, db provider, keycloak auth guard`

### Task 5.2: Content modules (sites, pages, versions)

**Files:**
- Create: `apps/api/src/content/{content.module.ts,sites.controller.ts,pages.controller.ts,pages.service.ts,versions.service.ts}`
- Test: `apps/api/test/content.int.test.ts` (Testcontainers)

Endpoints (all under auth; mutations need editor+):
```
GET    /sites                          → list
GET    /sites/:siteId/pages            → pages with per-locale summary
POST   /sites/:siteId/pages            → create page + default locale + empty draft v1
POST   /pages/:pageId/locales          → add locale (+ empty draft v1)
GET    /page-locales/:id/versions      → version list (no puckData)
GET    /versions/:id                   → full version (puckData)
PUT    /page-locales/:id/draft         → save draft (see below)
```
Draft semantics: `saveDraft(pageLocaleId, puckData, baseVersionNo?)` — if latest version is a draft, overwrite its `puckData` in place; if latest is published/archived, insert new version `versionNo = latest+1` status draft. Optimistic concurrency: if `baseVersionNo` given and ≠ latest versionNo → 409.

- [ ] **Step 1 (TDD, Testcontainers):** integration tests boot PG container, run migrations programmatically (`drizzle-kit` API or `migrate()` from drizzle-orm/postgres-js/migrator), build Nest test app with auth guard overridden by fake editor user. Tests: create page → page + locale + v1 draft exist; duplicate path → 409; add locale twice → 409; saveDraft on draft overwrites (still v1); saveDraft after publish creates v2; stale `baseVersionNo` → 409.
- [ ] **Step 2: Implement** services with drizzle transactions; path normalization (trim trailing `/`, ensure leading).
- [ ] **Step 3:** tests green. **Commit** `feat(api): sites/pages/versions content api`

### Task 5.3: Publish module + invalidation

**Files:**
- Create: `apps/api/src/publish/{publish.module.ts,publish.controller.ts,publish.service.ts,revalidate.client.ts}`
- Test: `apps/api/test/publish.int.test.ts`

Endpoints:
```
POST /page-locales/:id/publish   {versionId} → publish that version
POST /page-locales/:id/unpublish              → remove from published_pages
```
Publish tx: assert version belongs to locale → set prior published versions of this locale to `archived` → set this version `published` → upsert `published_pages` (computed path = page.path with slugOverride applied to last segment if set; seo from root props title/description) → after commit: `revalidateClient.invalidate([tag])` where tag = `page:{siteId}:{locale}:{path}`.

`revalidate.client.ts`: POST `${WEB_INTERNAL_URL}/api/revalidate` body `{tags:[...]}` + header `x-revalidate-signature` = HMAC-SHA256(body, REVALIDATE_SECRET). Failure: log warn, enqueue BullMQ `invalidation` job (retry 5x exp backoff). Non-blocking for the API response.

- [ ] **Step 1 (TDD):** tests: publish → published_pages row with denormalized puckData; republish older version (rollback) → snapshot swapped, old published version archived; unpublish → row gone; revalidate client called with right tag (mock HTTP); publish of version from another locale → 404/403.
- [ ] **Step 2: Implement.** BullMQ queue registered (`@nestjs/bullmq`, connection from REDIS_URL).
- [ ] **Step 3:** green. **Commit** `feat(api): transactional publish with cache invalidation`

### Task 5.4: Media module

**Files:**
- Create: `apps/api/src/media/{media.module.ts,media.controller.ts,media.service.ts,s3.provider.ts}`
- Test: `apps/api/test/media.int.test.ts` (Testcontainers + MinIO container)

Endpoints:
```
POST /sites/:siteId/media/presign  {filename,mime,size} → {mediaId, uploadUrl, s3Key}
POST /media/:id/confirm                                  → 202, enqueues process job
GET  /sites/:siteId/media?status=ready&cursor=…          → library listing
DELETE /media/:id                                        → delete S3 object + row
```
`s3Key = sites/{siteId}/media/{mediaId}/{sanitized-filename}`. Presign: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, PUT, 10 min expiry, ContentType pinned. Confirm: HeadObject verifies existence + size ≤ limit → enqueue BullMQ `media-process` job `{mediaId}`.

- [ ] **Step 1 (TDD):** presign → media row uploading + URL contains key; confirm before upload → 409 (HeadObject 404); upload via presigned URL (real PUT to MinIO container) then confirm → job enqueued (assert via Queue.getJob).
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** green. **Commit** `feat(api): media presigned upload lifecycle`

---

## Phase 6 — `apps/worker` (BullMQ)

### Task 6.1: Media processor

**Files:**
- Create: `apps/worker/src/{main.ts,worker.module.ts,media.processor.ts,invalidation.processor.ts}`, `apps/worker/package.json`, `tsconfig.json`
- Test: `apps/worker/src/__tests__/media.processor.test.ts`

- [ ] **Step 1 (TDD):** unit test processor logic with injected fakes (s3 get → fixture image buffer, db): produces width/height/mime via sharp metadata, 32x32 blurhash, strips EXIF (re-encode via `sharp().rotate().withMetadata({exif:{}})` → assert no gps tag), sets status ready; corrupt buffer → status failed after retries exhausted.
- [ ] **Step 2: Implement** Nest standalone app (`NestFactory.createApplicationContext`), `@Processor('media-process')` WorkerHost + `@Processor('invalidation')` (re-POSTs revalidate endpoint). Deps: sharp, blurhash. EXIF strip = rewrite object in place (same key) with cleaned bytes.
- [ ] **Step 3:** green; `pnpm --filter worker dev` boots against compose. **Commit** `feat(worker): media processing + invalidation retry workers`

---

## Phase 7 — `@cms/puck-config`

### Task 7.1: Split editor/render config + base components

**Files:**
- Create: `packages/puck-config/src/{types.ts,render.tsx,editor.tsx,components/{section.tsx,heading.tsx,text.tsx,image.tsx,button.tsx},image-url.ts}`
- Test: `packages/puck-config/src/__tests__/render.test.tsx`

Components (slot-based, no DropZone): `Section` (slot `children`, maxWidth/padding props), `Columns` (array of slots via `slot` fields, 2–4), `Heading` (text, level select), `Text` (richtext field), `Image` (custom field → media object `{mediaId,s3Key,alt,width,height,blurhash}`), `Button` (label, href, variant).

- `types.ts`: `Props` map + `CmsConfig = Config<Props>`; `PUCK_SCHEMA_VERSION = 1`.
- `render.tsx`: RSC-safe — pure presentational render functions, **no hooks, no "use client"**; exports `renderConfig`.
- `editor.tsx`: `"use client"`; spreads `renderConfig` and adds field definitions (richtext, custom image field placeholder wired in Task 8.3) + categories + root config (title, description fields → seo).
- `image-url.ts`: `imgproxyUrl({s3Key,width,height?,key,salt,baseUrl})` — signed path `/{signature}/rs:fit:{w}:{h}/plain/s3://{bucket}/{key}@webp`, HMAC-SHA256 per imgproxy spec (hex key/salt). Works in RSC (node:crypto) — client gets prebuilt URLs.

- [ ] **Step 1 (TDD):** render test: `<Render config={renderConfig} data={seedData}/>` via react-dom/server `renderToString` outputs heading text; imgproxy URL test against a known-good signature fixture.
- [ ] **Step 2: Implement.** Dep: `@puckeditor/core` `~0.21.3`, react 19 peer.
- [ ] **Step 3:** green. **Commit** `feat(puck-config): split RSC render/editor config with base components`

---

## Phase 8 — `apps/web` (Next.js)

### Task 8.1: Next scaffold + Redis cache handler + public render path

**Files:**
- Create: `apps/web/{package.json,next.config.ts,tsconfig.json}`, `src/middleware.ts` (site resolve), `src/lib/{db.ts,site.ts,page-data.ts}`, `src/app/[locale]/[[...path]]/page.tsx`, `src/app/api/revalidate/route.ts`, `src/app/layout.tsx`

- [ ] **Step 1:** Next 16.2 manual scaffold (App Router, src dir, no tailwind — plain CSS modules). `next.config.ts`:
```ts
import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  cacheHandler: process.env.NODE_ENV === 'production'
    ? require.resolve('@trieb.work/nextjs-turbo-redis-cache') : undefined,
  cacheMaxMemorySize: 0,
  images: { loader: 'custom', loaderFile: './src/lib/imgproxy-loader.ts' },
};
export default config;
```
- [ ] **Step 2: Page route** `src/app/[locale]/[[...path]]/page.tsx`:
```tsx
import { unstable_cacheTag as cacheTag } from 'next/cache'; // or "use cache" + cacheTag per Next 16 API
import { Render } from '@puckeditor/core/rsc';
import { renderConfig } from '@cms/puck-config/render';
import { getPublishedPage } from '@/lib/page-data';
import { notFound } from 'next/navigation';

export const revalidate = false; // cache until tag invalidation

export default async function Page({ params }: { params: Promise<{ locale: string; path?: string[] }> }) {
  const { locale, path = [] } = await params;
  const sitePath = '/' + path.join('/');
  const page = await getPublishedPage(locale, sitePath); // tags page:{site}:{locale}:{path}
  if (!page) notFound();
  return <Render config={renderConfig} data={page.puckData} />;
}
```
`page-data.ts`: site from middleware-set header `x-site-id` (middleware resolves Host → site via cached lookup), then single drizzle select on `published_pages`, wrapped in `unstable_cache`/`"use cache"` with `cacheTag('page:…')`. `generateMetadata` from `seo` jsonb + hreflang alternates (query sibling locales of pageId, also tagged).
- [ ] **Step 3: Revalidate endpoint** `src/app/api/revalidate/route.ts`: verify HMAC header (timing-safe compare), parse `{tags}`, loop `revalidateTag(tag)` → `{revalidated:true}`; bad signature → 401.
- [ ] **Step 4:** Manual check: compose up + seed → `pnpm --filter web dev` → `curl localhost:3000/en/` renders seeded home; unknown path → 404. Publish `/about` via API curl → page appears without restart.
- [ ] **Step 5: Commit** `feat(web): public render path with tagged redis-backed cache`

### Task 8.2: Auth (openid-client) + session

**Files:**
- Create: `src/lib/session.ts`, `src/lib/oidc.ts`, `src/app/api/auth/{login,callback,logout}/route.ts`, `src/lib/api-client.ts`

- [ ] **Step 1:** `oidc.ts` — openid-client v6: discovery cached at module level; login route: PKCE verifier+state in short-lived encrypted cookie → redirect to Keycloak; callback: code exchange → store `{accessToken, refreshToken, expiresAt, profile, roles}` in encrypted httpOnly cookie (AES-GCM via `jose` EncryptJWT, SESSION_SECRET); logout: clear + Keycloak end-session redirect. `session.ts`: `getSession()` for RSC/route handlers, transparent refresh when `expiresAt < now+30s` (refresh grant, re-set cookie).
- [ ] **Step 2:** `api-client.ts` — typed fetch wrapper for Nest API: base `API_URL`, bearer from session, zod-parses responses with `@cms/contracts`, throws typed ApiError.
- [ ] **Step 3:** Manual: `/api/auth/login` → Keycloak form → editor login → callback sets cookie → `/admin` shows email. **Commit** `feat(web): keycloak oidc auth with encrypted cookie session`

### Task 8.3: Admin: pages list + Puck editor + preview

**Files:**
- Create: `src/app/admin/{layout.tsx,page.tsx}`, `src/app/admin/sites/[siteId]/page.tsx`, `src/app/admin/edit/[pageLocaleId]/page.tsx`, `src/components/admin/{editor-client.tsx,media-field.tsx,media-library.tsx,publish-bar.tsx}`, `src/app/preview/[versionId]/page.tsx`

- [ ] **Step 1: Admin shell** — `admin/layout.tsx` RSC: `getSession()`, no session → redirect login; viewer allowed read-only. Pages list: sites → pages table with per-locale status chips (draft/published/version no), "add locale" (from site.locales minus existing), "create page" form.
- [ ] **Step 2: Editor route** — RSC loads latest version JSON + permissions, passes to `editor-client.tsx` (`"use client"`, `next/dynamic` import of Puck, `ssr:false`):
  - `<Puck config={editorConfig} data={version.puckData} permissions={puckPermissionsFor(roles)} onPublish={...}>`
  - autosave: debounced (1.5s) `onChange` → PUT draft with `baseVersionNo`; 409 → banner "newer version exists, reload".
  - publish-bar override: Save status, Preview link (new tab → `/preview/{versionId}`), Publish button → POST publish → toast.
  - remount key = pageLocaleId.
- [ ] **Step 3: media-field.tsx** — Puck custom field for `Image`: button opens `media-library.tsx` modal (lists ready media via API, upload flow: presign → PUT to S3 → confirm → poll until ready), stores media object into props. Wire into `editor.tsx` config (replace placeholder).
- [ ] **Step 4: Preview route** — `/preview/[versionId]`: auth required, `export const dynamic = 'force-dynamic'`, fetch version via API, `<Render>` with draft data, `<meta name="robots" content="noindex">`.
- [ ] **Step 5:** Manual E2E by hand: login → create page → drag Heading → autosave → preview → publish → public URL serves. **Commit** `feat(web): admin pages list, puck editor with autosave/publish, preview`

### Task 8.4: imgproxy loader + Image component polish

**Files:**
- Create: `src/lib/imgproxy-loader.ts`
- Modify: `packages/puck-config/src/components/image.tsx`

- [ ] **Step 1:** Loader: `({src,width,quality}) => imgproxyUrl(...)` — src carries s3Key. Image component renders `next/image` with blurhash placeholder (`placeholder="blur"`, blurDataURL from stored blurhash → tiny png via `blurhash` decode at render or precomputed data URL stored on confirm — store data URL in media row at processing time, simpler: worker writes `blur_data_url` column; add migration).
- [ ] **Step 2:** Visual check on seeded page. **Commit** `feat(web): imgproxy image loader with blurhash placeholders`

---

## Phase 9 — E2E, CI, k8s reference

### Task 9.1: Playwright smoke

**Files:**
- Create: `e2e/{playwright.config.ts,smoke.spec.ts,package.json}`

- [ ] **Step 1:** Single spec against compose+dev servers: login as editor (fill Keycloak form), create page `/smoke-{ts}`, add Heading with text, wait autosave badge, publish, assert `GET /en/smoke-{ts}` contains text. Tag `@smoke`.
- [ ] **Step 2:** green locally. **Commit** `test(e2e): editor-to-public smoke flow`

### Task 9.2: CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1:** jobs: lint+typecheck; unit (turbo test, no containers); integration (services or Testcontainers on ubuntu runner); build (turbo build). pnpm cache. Node 22.
- [ ] **Step 2: Commit** `ci: lint, typecheck, test, build pipeline`

### Task 9.3: k8s reference manifests + docs

**Files:**
- Create: `infra/k8s/{web.yaml,api.yaml,worker.yaml,imgproxy.yaml,README.md}`, `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile`, root `README.md`

- [ ] **Step 1:** Multi-stage Dockerfiles (pnpm fetch → build → standalone runtime, non-root). Web: copy `.next/standalone` + static; jemalloc note for sharp. Manifests: Deployments + HPA (web cpu 70%), Service, sample Ingress, env via Secret/ConfigMap refs, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` shared across web replicas, readiness probes. README: architecture diagram, quickstart, scaling notes (RPS expectations, Redis sizing, CDN purge hook extension point).
- [ ] **Step 2:** `docker build` all three → success. **Commit** `feat(infra): dockerfiles, k8s reference, docs`

---

## Self-review notes

- Spec coverage: read path (8.1), write path (5.2/5.3, 8.3), preview (8.3), i18n model (2.1 pages/page_locales, 8.1 hreflang), multi-site (middleware 8.1), auth+RBAC (4.1, 5.1, 8.2), media (5.4, 6.1, 8.3, 8.4), error handling (5.3 retry queue, 6.1 failed status), testing (per-task TDD + 9.1), DX (1.1 compose, 2.2 seed), out-of-scope respected.
- Known risk: `@trieb.work` handler is legacy `cacheHandler` API; if Next 16.2 tag semantics misbehave with `revalidate=false` + `unstable_cache`, fallback is `@fortedigital/nextjs-cache-handler` (composite) — isolated in next.config + page-data.ts only.
- Puck 0.21 API drift risk: pinned `~0.21.3`; editor isolated in `editor-client.tsx` + `packages/puck-config`.
