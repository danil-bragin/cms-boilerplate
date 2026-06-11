# Editor + SEO batch (2026-06-11)

Five features. Order by dependency, commit per group.

## A. Post pagination + archive (SEO: orphaned posts)
- `getPostsPage(siteId, locale, page, perPage)` — keyset/offset on
  first_published_at DESC, cached tag `posts:{site}:{locale}`
- `PostList` gains optional `paginated` + per-page; renders rel=prev/next
  crawlable `<a>` to `?page=N` (or the block reads `searchParams`)
- Public archive: PostList already server-rendered; add page param handling in
  the catch-all page (read searchParams, dynamic when paginating) OR a dedicated
  PostList that fetches page N. Keep it cache-friendly: page param tagged.
- Article schema unaffected.

## B. Author E-E-A-T pages
- `authors` table (siteId, slug, name, bio, avatarMediaKey?, sameAs[]) +
  per-site admin CRUD. pages.author becomes optional FK-ish (keep text author
  for back-compat; add authorSlug).
- `/{locale}/author/{slug}` public page: ProfilePage + Person JSON-LD
  (name, url, sameAs, image), lists author's posts (PostList filtered).
- Article JSON-LD author becomes `{ @type: Person, name, url: author page }`.
- Visible byline links to author page.

## C. Image focal point / crop
- media gains `focalX`/`focalY` (0..1, default 0.5/0.5)
- media library: click-to-set focal point UI on the preview
- imgproxy URL builder: gravity `fp:{x}:{y}` when cropping (rs:fill + gravity)
- Image component: optional crop ratio prop → uses fill + focal gravity

## D. Version diff
- editor versions panel: "Compare with current" → side-by-side
- diff = structural compare of two puck payloads (added/removed/changed blocks
  by id + prop changes); render a readable diff panel (no external lib —
  small JSON walk)
- API: getVersion already returns puckData; client computes diff

## E. GSC dashboard (URL Inspection)
- per-site OAuth-less: store a service-account JSON in site.settings (or env)
  + Search Console URL Inspection API client in the API
- admin page: per published page, show last index status (cached, on-demand
  refresh button), quota-aware (2000/day)
- Gracefully no-op when not configured (most installs); documented setup

## Verify per group: build, typecheck, api tests, e2e unaffected, manual smoke.
