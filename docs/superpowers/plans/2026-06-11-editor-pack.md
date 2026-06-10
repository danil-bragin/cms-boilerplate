# Editor Pack + Content Ops + Prod Maturity (2026-06-11)

Scope: everything from the "что ещё" roadmap, boilerplate-grade MVP each.

## Phase A — schema (one migration)
- `redirects` (siteId, fromPath, toPath, status 301|302, uq(siteId,fromPath))
- `menus` (siteId, slug, items jsonb, uq(siteId,slug))
- `webhooks` (siteId, url, secret, events[], active)
- `scheduled_publishes` (pageLocaleId, versionId, publishAt, status, createdBy)
- `published_pages.search_text` text + GIN index (filled at publish from puck content)

## Phase B — API (Nest)
- sites CRUD: create site, patch domains/locales/settings(seo), patch slugOverride
- redirects CRUD; menus CRUD; webhooks CRUD
- schedule publish: POST/DELETE, BullMQ delayed job, processor in API consumes
  `scheduled-publish` queue → PublishService.publish
- publish dispatches `webhook` queue jobs (HMAC-signed payload, worker delivers, retries)
- media PATCH alt; media DELETE already exists
- search_text extraction at publish (generalize extractDescription walk)

## Phase C — web
- proxy: redirects SWR map → 301/302 before path-set check
- shareable preview: /preview/{versionId}?token=HMAC(versionId,exp) bypasses session;
  "Share preview" button generates link (server action)
- public search: GET /api/search?q&locale (websearch_to_tsquery over search_text,
  site by host, short cache)

## Phase D — admin UI
- editor: versions panel (list, preview any, restore=saveDraft from old, publish old),
  schedule picker in publish bar
- rich text: Text component → puck `richtext` field (TipTap), render HTML
- /admin/sites: create/edit site (domains, locales, default locale, blockAiTraining),
  slug override per page locale
- /admin/menus: menu editor (flat list label/href/order, one nesting level)
- media library v2: search box, delete, alt editing
- /admin/redirects + /admin/webhooks: simple tables + create/delete

## Phase E — prod maturity
- CSP header baseline + docs
- renovate.json (pin-aware: redis 4.7.0, puck ~0.21 grouped)
- Helm chart (web/api/worker/imgproxy, values.yaml, HPA)
- compose observability profile += prometheus (OTLP receiver) + grafana
  (provisioned datasource + CMS dashboard json)
- docs/operations.md: backup/DR (pg WAL, S3 versioning), upgrade playbook

Order: A → B → C → D → E, commit per phase, tests per phase (API int tests for
new modules, e2e extended for versions/schedule happy path).
