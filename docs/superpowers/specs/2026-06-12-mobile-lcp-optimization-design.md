# Mobile LCP Optimization — Design

**Date:** 2026-06-12
**Status:** Approved, pending implementation plan
**Owner:** web render layer + media pipeline + CI

## Problem

Desktop Lighthouse is excellent (perf 100, LCP 0.5s). Mobile is not: a real
mobile Lighthouse run (Moto-G class, 4× CPU throttle, slow 4G, simulated) on the
home page `/en` measures:

- **perf 97, LCP 2.6s** (yellow zone — Google "good" is < 2.5s)
- FCP 0.6s, TBT 10ms, CLS 0, Speed Index 0.6s — all green

Everything is fast except LCP. The LCP element is the hero product image. LCP
phase breakdown:

| Phase | Time | Share |
|---|---|---|
| TTFB | 451ms | 18% |
| Load Delay | 0ms | 0% (preload works) |
| Load Time | 672ms | 26% (image download) |
| **Render Delay** | **1432ms** | **56%** |

TBT is ~0, so the render delay is **not** JS main-thread contention. The likely
cause is **large-image decode under 4× CPU throttle** plus image bytes. Lighthouse
opportunities confirm:

- `modern-image-formats`: ~24 KiB savings — imgproxy served **JPEG**, not WebP/AVIF,
  despite `IMGPROXY_AUTO_AVIF/WEBP` being set in infra config (negotiation is not
  effective in practice).
- `uses-responsive-images`: ~21 KiB savings — mobile receives an image larger than
  its viewport needs.
- `unused-javascript`: ~52 KiB — client JS that does not serve the first paint
  (hurts INP and weight, not LCP directly).

## Goal / Success Criteria

On the mobile Lighthouse preset (default form factor, /en and /en/blog):

- **LCP < 1.2s** (green zone with margin)
- perf ≥ 98, INP/TBT green, CLS held at 0
- Desktop remains 100 / LCP ~0.5s (no regression)
- Demo visuals unchanged (verified by before/after screenshots)
- A CI mobile gate prevents regression

Every workstream is verified with a real mobile Lighthouse run (before/after),
recording LCP and its phase breakdown — not estimated.

## Approach

Three workstreams, executed in order, each measured before moving on:
**A (image) → measure → B (static JS) → C (CI gate)**.

### Workstream A — Image pipeline (attacks LCP load + decode)

Touches: `packages/puck-config/src/render.tsx` (Hero, Card, Image), `post-card.tsx`,
`image-url.ts`, `apps/web/src/app/s/[siteId]/[locale]/[[...path]]/page.tsx` (LCP
preload link), local imgproxy configuration.

1. **Right-size for mobile.** Add small breakpoints to every `srcSet`
   (360/480/768/1024/1280) and fix the `sizes` attributes so a ~390px-CSS mobile
   viewport pulls a ~400–768px variant instead of 1280. Applies to the Hero
   foreground image, Card covers, and the generic Image block. Smaller bytes **and**
   smaller decode under throttle.
2. **Deliver a modern format that actually arrives.** Root-cause why imgproxy
   returned JPEG with `IMGPROXY_AUTO_AVIF/WEBP` enabled (does the `Accept` header
   reach imgproxy? is `Vary: Accept` set? is a format being forced?). Default to
   **WebP** — its decode cost on a weak CPU is lower than AVIF — and offer AVIF
   progressively, validated by measurement.
3. **Paint the LCP sooner.** Hero LCP image gets `fetchpriority="high"` and
   `decoding="sync"` (paints as soon as decoded rather than deferring), stays
   `loading="eager"`. Render the existing `blurDataUrl` LQIP as a background so
   something paints at FCP. The `<link rel=preload>` must reference the **same**
   srcSet/sizes/format as the rendered `<img>` so the preloaded variant is the one
   chosen.
4. **Cap the hero background image** (currently 1920) to ≤ 768 on small screens.

Acceptance: LCP load-time and render-delay both drop; `modern-image-formats` and
`uses-responsive-images` audits pass.

### Workstream B — Static-first public pages (attacks INP + JS/HTML weight)

Touches: `packages/puck-config/src/components/search-box.tsx`, `post-pager.tsx`,
`post-list.tsx`, `apps/web/src/app/s/[siteId]/[locale]/layout.tsx`, vitals reporter.

**Architecture constraints discovered during planning (must be respected):**
- The public route is `revalidate = false` (fully static, full-HTML Redis cache).
  Depending on a `?page=N` searchParam would make it dynamic and **defeat the
  page cache** — so server-side pagination via query string is out.
- The proxy fast-404s any path not in `published_pages` (`src/proxy.ts`), so a
  `/{locale}/search` results route would 404 — a native search form target is out.

Given those, the goal (remove client JS from the LCP critical path) is achieved by
**deferring island hydration**, not by rewriting to forms/server pagination:

1. **Defer-hydrate the search island.** Keep `SearchBox` (it backs `/api/search`),
   but load/hydrate it lazily — after LCP or on first interaction (focus/click on a
   lightweight placeholder) — so its JS never competes with the LCP paint.
2. **Defer-hydrate the PostPager island.** The initial page is already
   server-rendered (crawlable); only the pagination controls need JS. Hydrate the
   pager lazily (after LCP / on idle) so the client `web-vitals`/fetch code is off
   the critical path. Pagination stays client-fetch against `/api/posts` (does not
   break the static cache).
3. **Defer vitals.** Load `web-vitals` after LCP / on idle (`requestIdleCallback`)
   so it never competes with the LCP paint.
4. **Slim styles.** Extract the repeated heavy inline-style objects in the render
   components into a small static stylesheet (CSS module or one `<style>` of atomic
   classes). Smaller HTML, faster style recalc, cacheable. Visuals stay identical.

Acceptance: public-page client JS on first paint approaches zero; the
`unused-javascript` audit drops; INP stays green; HTML transfer size decreases.

### Workstream C — Mobile CI gate

Touches: `lighthouserc.mobile.json` (new), `.github/workflows/ci.yml`.

1. Add a **mobile** Lighthouse run on `/en` and `/en/blog` with budgets:
   LCP ≤ 1500ms, INP/TBT, CLS ≤ 0.1, perf ≥ 0.95 — alongside the existing desktop
   run (two configs).
2. Mobile LCP is image-driven, so the gate must test **with images** rendering.
   Reintroduce imgproxy + MinIO in CI as **service containers** (not the previous
   fragile `--network host` step), with a wait-and-verify step that **fails loudly
   if a rendered image 404s**. (This reverses the earlier media-skip workaround for
   the lighthouse job, now that mobile LCP must be measured on real images.)

Acceptance: CI goes red if mobile LCP regresses; green at the target.

## Verification Protocol (per workstream)

- Before/after: run `lighthouse <url> --form-factor=mobile` locally; record perf,
  LCP, and the LCP phase breakdown.
- Acceptance gate: LCP < 1.2s on `/en` mobile; desktop still 100; demo visuals
  unchanged (Playwright screenshot of /en and /en/blog compared before/after).

## Risks / Tradeoffs

- `decoding="sync"` can marginally delay other paints — measure, keep only if LCP
  improves net.
- AVIF decode cost on a weak CPU may negate the byte savings → WebP is the default;
  AVIF is gated on measurement.
- Static-CSS extraction touches every render component → visual-regression risk →
  guarded by screenshot comparison.
- The mobile gate reintroduces imgproxy + MinIO into CI — accepted, but hardened as
  service containers with explicit fail-on-404 so it cannot silently pass on broken
  images.

## Out of Scope

- Edge/regional TTFB reduction (already CDN-cached in prod; TTFB is only 18% of LCP).
- Changing the ISR/Redis cache architecture.
- Desktop budgets (already met).
