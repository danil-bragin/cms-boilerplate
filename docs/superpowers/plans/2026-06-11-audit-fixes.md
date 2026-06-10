# Audit Fixes + Remaining Gaps (2026-06-11)

Source: dual code audit (security + correctness agents, findings verified file:line).

## Wave 1 — correctness criticals
1. editor-client: `versionId` via ref (publish published stale version)
2. publish: row-lock pageLocale (`FOR UPDATE`) — kills double-published race +
   publish/unpublish interleave
3. publish: path-change cleanup — delete published rows for (pageId, locale) at
   other paths + AUTO-REDIRECT old→new (fixes slugOverride orphan; reused by rename)
4. drafts: optimistic concurrency on `updated_at` (overwrite-in-place bumps it;
   baseVersionNo can't see draft-draft conflicts); 23505 → 409 (saveDraft, createPage)
5. scheduled publish: freeze content — snapshot puckData into the schedule row;
   processor creates a fresh version from the snapshot and publishes it
6. schedule: enqueue-after-insert with failure rollback; cancel via conditional
   `UPDATE ... WHERE status='pending'` + tolerant job.remove
7. worker images: skip re-encode when no EXIF; mozjpeg q90 when stripping →
   idempotent retries, no generational loss
8. proxy: cold-start siteMap failure → 503 (honest), not 404; redirect creation
   validates self-loop + one-level chain

## Wave 2 — security
1. **site membership**: `site_members` table; global cms-admin bypasses; every
   id-addressed service op resolves siteId and asserts membership; member mgmt
   API + UI on sites page; seed adds editor to demo site
2. webhook SSRF: DNS-resolve + private/loopback/link-local/metadata IP block,
   http(s) only, redirects blocked (delivery-time, worker)
3. stored XSS: `sanitize-html` allowlist applied server-side in saveDraft to all
   `text` string props
4. createPreviewLink: session + canEdit check
5. OIDC returnTo: reject `//` and `/\` at login and callback
6. JSON-LD: escape `<` as <
7. /api/search: per-IP token bucket (in-memory, per replica) + query caps
8. CORS pinned via env; imgproxy/compose secrets parametrized with dev defaults;
   keycloak dev-realm marked, prod hardening documented
9. CSP: keep unsafe-inline (nonces are impossible with full-page ISR — per-request
   nonce breaks cached HTML; primary XSS fix is sanitization) — document
10. read endpoints require cms-viewer minimum

## Wave 3 — lifecycle/architecture
1. page delete (cascade + published cleanup + invalidate) + UI
2. page rename (PATCH path) → moves published rows, auto-301s, invalidates + UI
3. locale fallback (site setting): proxy 307 to default locale when translation missing
4. schedule reconciliation sweep (repeatable BullMQ job in API)
5. versions panel shows createdBy

## Wave 4 — product/ops
1. public SearchBox puck component (client island)
2. menu builder: flat row editor (JSON textarea stays for nested)
3. page duplicate endpoint + UI
4. release.yml: build+push images to ghcr on tag
5. web unit tests (preview-token, sanitize behavior via api test)

Explicitly out (documented): media folders (search covers), Keycloak user CRUD UI
(Keycloak console is the user store), CSP nonces (ISR-incompatible), presigned
POST content-length policy (confirm() enforces size).
