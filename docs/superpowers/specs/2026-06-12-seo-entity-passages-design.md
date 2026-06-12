# SEO: Passage Anchors + Author/Entity Schema — Design

**Date:** 2026-06-12
**Status:** Approved, implementing
**Source:** deep-research report (2026-06-12) — top-impact 2026 SEO/AEO gaps.

## Why (verified research)

- AI engines **chunk pages into passages** and rank each independently; deep-linkable,
  self-contained sections lift citation rate (~+17% from structure). → give every
  content heading a stable anchor id (RAG-addressable passages + jump links).
- **Author/entity attribution is tracked** by Google (`isAuthor` in the 2024 API
  leak; author markup helps — the "doesn't help" claim was refuted 0-3). The current
  Article author is a thin inline `Person {name,url}`. → emit a full `Person` entity
  node (`@id`, `sameAs`, `image`, `description`) and reference it; upgrade Organization
  `logo` to an `ImageObject`. Strengthens entity recognition + E-E-A-T.

Both are programmatic, general, no editorial/AI tooling — pure CMS output.

## Scope (this change)

### A. Passage anchors
`packages/puck-config/src/render.tsx` `Heading`: render `<Tag id={slugify(text)} …>`
with `scroll-margin-top` so anchored jumps clear any sticky header. `slugify` is a
small unicode-safe helper in `packages/puck-config/src/slug.ts` (lowercase, strip
tags, non-alphanumeric → `-`, trim, cap length). Duplicate-heading collisions are
acceptable (browser uses the first); no index suffix for now.

### B. Author Person entity + Org logo ImageObject
`apps/web/src/components/seo/json-ld.tsx`:
- Replace the inline `page.author` Person with an optional `page.authorEntity:
  { name, url, image?, sameAs?, description? }`. When present, emit a `Person`
  node in `@graph` with `@id = url`, `name`, `url`, `image` (`ImageObject`),
  `description` (bio), `sameAs`; the `Article.author` becomes `{ '@id': url }`.
  Falls back to the current thin inline Person when only a name is known.
- `Organization.logo`: string → `ImageObject { url }`.

`apps/web/src/app/s/[siteId]/[locale]/[[...path]]/page.tsx`: for posts with an
author slug, fetch the author (`getAuthor`) and pass `authorEntity` with the
avatar (`imageUrl(avatarKey, {width:200,height:200})`), `sameAs`, and `bio`.

## Verification

- Heading HTML contains `id="…"` per content heading; clicking `#slug` jumps.
- JSON-LD validates: `Person` node with `@id`/`sameAs`/`image`, `Article.author`
  references it by `@id`, `Organization.logo` is an `ImageObject`. Check via the
  rendered `<script type="application/ld+json">` (parse + assert shape).
- Visuals unchanged; typecheck clean.

## Out of scope (separate, higher-effort)

- Auto internal linking / topical clusters (#1) and editor quality lints (#2) — the
  bigger GEO levers; tracked for a later round.
- `knowsAbout`/credentials — no source data in the schema; not fabricated.
- FAQ/HowTo schema — deliberately NOT added (rich results removed May 2026).
