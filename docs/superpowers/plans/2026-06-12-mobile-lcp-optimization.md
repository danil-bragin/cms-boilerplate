# Mobile LCP Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get mobile Lighthouse LCP on `/en` from 2.6s (yellow) to <1.2s (green with margin) and keep INP/CLS green, without regressing desktop or changing the demo visuals.

**Architecture:** Three workstreams run in order, each gated by a real mobile Lighthouse measurement. A = image pipeline (right-size + real WebP + paint-fast LCP), the dominant LCP lever. B = defer client-island hydration + slim styles (INP/weight). C = a mobile Lighthouse CI gate that tests real images via hardened service containers.

**Tech Stack:** Next.js 16 (App Router, RSC `<Render>`), `@cms/puck-config` render config, imgproxy (signed S3 URLs), `@lhci/cli` + `lighthouse`, GitHub Actions.

**MEASUREMENT FINDING (after Workstream A — supersedes earlier assumptions):** Lighthouse *simulated* (lantern) throttling reports an inflated ~1.2s LCP "render delay" that does NOT occur on a real device. Under *devtools* (real applied) throttling the same page measures **LCP 1.4s, render-delay 22ms, perf 100**. The real bottleneck is **Load Delay** — every image (already tiny 3–6KB AVIF) only starts loading at ~583ms because the LCP preload fires only after the HTML document is parsed under 4× CPU throttle. Consequences: (1) the CI gate uses **`--throttling-method=devtools`**, not the default lantern; (2) Workstream B's value for LCP is real — smaller HTML + deferred inline JS → faster parse → earlier preload → lower Load Delay; (3) image *bytes* are already solved by Workstream A.

**Verification model:** Performance work is verified by measurement, not unit tests. Use **devtools throttling** (add `--throttling-method=devtools`) as the representative number. The repeatable command is:

```bash
LH=node_modules/.pnpm/node_modules/.bin/lighthouse
"$LH" "http://localhost:3000/en" --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path=/tmp/m.json --chrome-flags="--headless=new" --quiet
node -e "const r=require('/tmp/m.json');const a=r.audits;console.log('perf',Math.round(r.categories.performance.score*100),'LCP',a['largest-contentful-paint'].displayValue,'TBT',a['total-blocking-time'].displayValue,'CLS',a['cumulative-layout-shift'].displayValue);"
```

Local stack must be running: infra up, `pnpm db:seed` (WITH media), web built and `next start` on :3000, and `docker exec cms-boilerplate-redis-1 redis-cli -n 1 FLUSHDB` after any reseed.

---

## Task 0: Record baseline

**Files:** none (measurement only)

- [ ] **Step 1: Ensure full-media demo is seeded and served**

```bash
cd /Users/npden4ik/Projects/cms-boilerplate
pnpm db:seed
docker exec cms-boilerplate-redis-1 redis-cli -n 1 FLUSHDB
# (re)build + start web if not already running on :3000
(cd apps/web && set -a; source ../../.env; set +a; ./node_modules/.bin/next build && nohup ./node_modules/.bin/next start -p 3000 >/tmp/web3000.log 2>&1 &)
timeout 60 bash -c 'until curl -sf http://localhost:3000/api/health; do sleep 1; done'
curl -s -o /dev/null http://localhost:3000/en   # warm the ISR cache
```

- [ ] **Step 2: Capture baseline mobile numbers for /en and /en/blog**

Run the verification command (above) for `/en` and `/en/blog`. Also capture the LCP phase breakdown:

```bash
node -e "const r=require('/tmp/m.json');const it=r.audits['largest-contentful-paint-element'].details.items;if(it[1])for(const p of it[1].items)console.log(p.phase,Math.round(p.timing)+'ms');"
```

Expected baseline (record actual): `/en` perf ~97, LCP ~2.6s, render-delay ~1.4s, TBT ~10ms, CLS 0.

- [ ] **Step 3: Capture baseline screenshots (visual-regression reference)**

Use Playwright MCP: navigate to `http://localhost:3000/en` and `http://localhost:3000/en/blog`, full-page screenshots saved as `/tmp/lcp-before-en.png` and `/tmp/lcp-before-blog.png`. These are the reference for "visuals unchanged".

---

## Workstream A — Image pipeline

### Task A1: Add responsive-image helpers to `image-url.ts`

DRY: today Hero, Card, the Image block, and the LCP preload each hand-build srcSet/sizes with different width lists and a hardcoded `(max-width:768px) 100vw, …` sizes. Centralize.

**Files:**
- Modify: `packages/puck-config/src/image-url.ts`

- [ ] **Step 1: Add a `buildSrcSet` helper and shared width/sizes constants**

Append to `packages/puck-config/src/image-url.ts`:

```ts
/** Width breakpoints that include small mobile sizes (not just 640+). */
export const RESPONSIVE_WIDTHS = [360, 480, 768, 1024, 1280, 1920] as const;

/** Build a `srcset` string for the given key, optionally cropping to a ratio. */
export function buildSrcSet(
  s3Key: string,
  opts: { widths?: readonly number[]; ratio?: [number, number]; crop?: { focalX?: number; focalY?: number } } = {},
): string {
  const widths = opts.widths ?? RESPONSIVE_WIDTHS;
  const heightFor = (w: number) => (opts.ratio ? Math.round((w * opts.ratio[1]) / opts.ratio[0]) : undefined);
  return widths
    .map((w) => `${imageUrl(s3Key, { width: w, height: heightFor(w), crop: opts.crop })} ${w}w`)
    .join(', ');
}

/** `sizes` for a full-bleed hero/product image: ~92vw on phones, capped on desktop. */
export const SIZES_HERO = '(max-width: 768px) 92vw, (max-width: 1100px) 90vw, 1040px';
/** `sizes` for a 3-up card grid: full width on phones, ~360px in the grid. */
export const SIZES_CARD = '(max-width: 768px) 92vw, 360px';
/** `sizes` for an in-content image block: full width on phones, content-width on desktop. */
export const SIZES_CONTENT = '(max-width: 768px) 92vw, 1024px';
```

- [ ] **Step 2: Export the helpers from the package index**

In `packages/puck-config/src/index.ts`, confirm `export * from './image-url.js';` already re-exports them (it does — `image-url.ts` is exported wholesale). No change needed; verify by grep:

```bash
grep -n "image-url" packages/puck-config/src/index.ts
```
Expected: `export * from './image-url.js';`

- [ ] **Step 3: Typecheck + build the package**

```bash
pnpm --filter @cms/puck-config typecheck && pnpm --filter @cms/puck-config build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/puck-config/src/image-url.ts
git commit -m "feat(puck): responsive-image srcset/sizes helpers with mobile breakpoints"
```

### Task A2: Right-size + paint-fast the Hero foreground (LCP element)

**Files:**
- Modify: `packages/puck-config/src/render.tsx` (Hero `<img>`, ~lines 196–206)

- [ ] **Step 1: Replace the Hero `<img>` srcSet/sizes/decoding and add LQIP background**

In `render.tsx`, find the Hero foreground image and replace it with:

```tsx
<img
  src={imageUrl(image.s3Key, { width: 768 })}
  srcSet={buildSrcSet(image.s3Key)}
  sizes={SIZES_HERO}
  alt={image.alt || ''}
  width={image.width ?? undefined}
  height={image.height ?? undefined}
  loading="eager"
  fetchPriority="high"
  decoding="sync"
  style={{
    width: '100%',
    maxWidth: 1040,
    height: 'auto',
    borderRadius: 14,
    boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
    background: image.blurDataUrl ? `url(${image.blurDataUrl}) center / cover` : undefined,
  }}
/>
```

Add `buildSrcSet, SIZES_HERO` to the existing `import { imageUrl } from './image-url.js';` line:

```ts
import { imageUrl, buildSrcSet, SIZES_HERO, SIZES_CARD, SIZES_CONTENT, RESPONSIVE_WIDTHS } from './image-url.js';
```

- [ ] **Step 2: Typecheck + build + restart web + flush cache**

```bash
pnpm --filter @cms/puck-config typecheck && pnpm --filter @cms/puck-config build
(cd apps/web && set -a; source ../../.env; set +a; ./node_modules/.bin/next build)
lsof -ti :3000 | xargs kill 2>/dev/null; (cd apps/web && set -a; source ../../.env; set +a; nohup ./node_modules/.bin/next start -p 3000 >/tmp/web3000.log 2>&1 &)
timeout 60 bash -c 'until curl -sf http://localhost:3000/api/health; do sleep 1; done'
docker exec cms-boilerplate-redis-1 redis-cli -n 1 FLUSHDB; curl -s -o /dev/null http://localhost:3000/en
```

- [ ] **Step 3: Measure /en mobile, expect LCP load-time + render-delay down**

Run the verification command for `/en`. Expected: LCP drops vs baseline (target trend toward <2s after this task alone; full <1.2s after A5/A6). Record the number.

- [ ] **Step 4: Commit**

```bash
git add packages/puck-config/src/render.tsx
git commit -m "perf(puck): hero LCP image — mobile srcset, sync decode, LQIP background"
```

### Task A3: Right-size the Image block, Card cover, and PostCard

**Files:**
- Modify: `packages/puck-config/src/render.tsx` (Image block `<img>`, ~lines 99–108; Card cover `<img>`, ~lines 221–226)
- Modify: `packages/puck-config/src/post-card.tsx` (img, lines 28–35)
- Modify: `apps/web/src/lib/images.server.ts` (`mapPost` cover srcSet, ~lines 26–44)

- [ ] **Step 1: Image block — use the helpers**

Replace the Image block `srcSet`/`sizes` (keep the existing `heightFor`/`crop` logic):

```tsx
srcSet={buildSrcSet(media.s3Key, crop ? { ratio: crop, crop: focal } : {})}
sizes={SIZES_CONTENT}
```
(`crop` here is the `[number, number]` ratio tuple already computed above in that block.)

- [ ] **Step 2: Card cover (render.tsx) — use the helpers**

Replace the Card cover `src`/`srcSet`/`sizes`:

```tsx
src={imageUrl(image.s3Key, { width: 768, height: Math.round((768 * 9) / 16), crop: { focalX: 0.5, focalY: 0.5 } })}
srcSet={buildSrcSet(image.s3Key, { widths: [360, 480, 768], ratio: [16, 9], crop: { focalX: 0.5, focalY: 0.5 } })}
sizes={SIZES_CARD}
```

- [ ] **Step 3: PostCard cover (post-card.tsx) — widen sizes for phones**

In `post-card.tsx`, change the `sizes` attribute (line 31) to:

```tsx
sizes={'(max-width: 768px) 92vw, 360px'}
```

And in `apps/web/src/lib/images.server.ts` `mapPost`, broaden the cover srcSet widths from `[400, 800]` to include a small mobile size — replace the `srcSet` builder:

```ts
srcSet: [320, 480, 800]
  .map((w) => `${imageUrl(p.cover!.s3Key, { width: w, height: ratioH(w), crop: { focalX: 0.5, focalY: 0.5 } })} ${w}w`)
  .join(', '),
```

- [ ] **Step 4: Typecheck both packages + web**

```bash
pnpm --filter @cms/puck-config typecheck && pnpm --filter @cms/puck-config build && pnpm --filter web typecheck
```
Expected: no errors.

- [ ] **Step 5: Rebuild + restart + flush + measure /en/blog mobile**

Repeat the rebuild/restart/flush block from Task A2 Step 2, then run the verification command for `/en/blog`. Expected: blog LCP/transfer down, still perf ~100.

- [ ] **Step 6: Commit**

```bash
git add packages/puck-config/src/render.tsx packages/puck-config/src/post-card.tsx apps/web/src/lib/images.server.ts
git commit -m "perf(puck): mobile-sized srcset for image block, card cover, post cover"
```

### Task A4: Make the hero background image responsive

**Files:**
- Modify: `packages/puck-config/src/render.tsx` (Hero `bgUrl`, ~line 167)

The hero background is a CSS `url()` so it cannot use srcSet. Serve a smaller default and rely on the dark gradient overlay (the bg is decorative, behind a 0.72–0.92 overlay, so a 1024 image is visually sufficient and much lighter than 1920).

- [ ] **Step 1: Lower the background render width**

Change:
```ts
const bgUrl = backgroundImage?.s3Key ? imageUrl(backgroundImage.s3Key, { width: 1920 }) : null;
```
to:
```ts
const bgUrl = backgroundImage?.s3Key ? imageUrl(backgroundImage.s3Key, { width: 1024 }) : null;
```

- [ ] **Step 2: Build + restart + flush + measure /en mobile**

Repeat rebuild/restart/flush, run verification for `/en`. Expected: total transfer down, LCP unchanged-or-better (bg is not LCP but competes for bandwidth on slow 4G).

- [ ] **Step 3: Commit**

```bash
git add packages/puck-config/src/render.tsx
git commit -m "perf(puck): serve hero background at 1024 (decorative, behind overlay)"
```

### Task A5: Sync the LCP `<link rel=preload>` with the hero `<img>`

The preload must request the **same** candidate the `<img>` will pick, or the browser double-downloads or preloads the wrong size.

**Files:**
- Modify: `apps/web/src/app/s/[siteId]/[locale]/[[...path]]/page.tsx` (preload link, ~lines 145–152)

- [ ] **Step 1: Match preload srcSet/sizes to the hero helpers**

Add the import near the top (next to the existing `import { imageUrl } from '@cms/puck-config';`):

```ts
import { imageUrl, buildSrcSet, SIZES_HERO } from '@cms/puck-config';
```

Replace the preload `<link>`:

```tsx
{lcp && (
  <link
    rel="preload"
    as="image"
    fetchPriority="high"
    imageSrcSet={buildSrcSet(lcp)}
    imageSizes={SIZES_HERO}
  />
)}
```

- [ ] **Step 2: Confirm `buildSrcSet`/`SIZES_HERO` are exported from `@cms/puck-config`**

```bash
node -e "const m=require('./packages/puck-config/dist/index.js'); console.log(typeof m.buildSrcSet, typeof m.SIZES_HERO);"
```
Expected: `function string`.

- [ ] **Step 3: Typecheck web + rebuild + restart + flush + measure /en mobile**

```bash
pnpm --filter web typecheck
```
Then rebuild/restart/flush and run verification for `/en`. Expected: Load Delay stays 0; the preloaded variant matches the rendered one (no duplicate image in `network-requests`). Verify no duplicate:

```bash
node -e "const r=require('/tmp/m.json');const imgs=r.audits['network-requests'].details.items.filter(i=>/product\\.webp|seed/.test(i.url));console.log('hero img requests:',imgs.length);"
```
Expected: 1 (not 2).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/s/[siteId]/[locale]/[[...path]]/page.tsx"
git commit -m "perf(web): preload hero LCP with same srcset/sizes as the rendered img"
```

### Task A6: Make imgproxy actually deliver WebP/AVIF

Baseline served `image/jpeg` (24 KiB of `modern-image-formats` savings) despite `IMGPROXY_AUTO_AVIF/WEBP` in infra config. Root-cause and fix.

**Files:**
- Investigate: running imgproxy container; possibly `infra/docker-compose.yml` (imgproxy env), `apps/web/src/app/api/media/[...key]/route.ts` (editor proxy — not the public path, but check it forwards Accept).

- [ ] **Step 1: Reproduce — what does imgproxy return for a webp-capable client?**

```bash
KEY=$(docker exec cms-boilerplate-postgres-1 psql -U cms -d cms -t -c "select s3_key from media where s3_key like '%product%' limit 1;" | tr -d ' \n')
# build a signed URL with the REAL local key/salt from .env
URL=$(node -e '
const {createHmac}=require("crypto");const fs=require("fs");
const env=Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const key=Buffer.from(env.IMGPROXY_KEY,"hex"),salt=Buffer.from(env.IMGPROXY_SALT,"hex");
const path="/rs:fit:768:0/plain/s3://"+(env.S3_BUCKET||"cms-media")+"/"+process.argv[1];
const sig=createHmac("sha256",key).update(Buffer.concat([salt,Buffer.from(path)])).digest("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
console.log((env.IMGPROXY_URL||"http://localhost:8081")+"/"+sig+path);' "$KEY")
echo "URL: $URL"
echo "-- Accept: webp/avif --"; curl -s -o /dev/null -w "%{content_type}\n" -H "Accept: image/avif,image/webp,*/*" "$URL"
echo "-- no Accept --"; curl -s -o /dev/null -w "%{content_type}\n" "$URL"
```
Expected after diagnosis: with the webp/avif Accept header, content-type SHOULD be `image/webp` or `image/avif`. If it returns `image/jpeg`, the running imgproxy lacks the AUTO flags or has `IMGPROXY_FORMAT`/extension forcing.

- [ ] **Step 2: Confirm the running container's flags**

```bash
docker inspect cms-boilerplate-imgproxy-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -iE "AUTO_|FORMAT|PREFER"
```
Expected: `IMGPROXY_AUTO_WEBP=true` and `IMGPROXY_AUTO_AVIF=true` present, no `IMGPROXY_FORMAT` forcing jpeg.

- [ ] **Step 3: Fix based on findings**

- If the running container is missing the flags (compose drifted): `docker compose -f infra/docker-compose.yml up -d --force-recreate imgproxy` to pick up the compose env, then re-run Step 1.
- If `infra/docker-compose.yml` imgproxy env is missing/incorrect, add:
  ```yaml
  IMGPROXY_AUTO_AVIF: "true"
  IMGPROXY_AUTO_WEBP: "true"
  ```
  (verify against current file first — they are present per `grep`, so this is a fallback).

- [ ] **Step 4: Verify webp delivery, then re-measure /en mobile**

Re-run Step 1; expect `image/webp` (or `image/avif`) with the webp Accept header. Flush cache, warm `/en`, run verification command, and check the audit cleared:

```bash
node -e "const r=require('/tmp/m.json');const a=r.audits['modern-image-formats'];console.log('modern-image-formats score',a.score,a.displayValue||'');"
```
Expected: score 1 (or no savings).

- [ ] **Step 5: Commit (only if a file changed)**

```bash
git add -A infra/docker-compose.yml 2>/dev/null; git commit -m "fix(infra): ensure imgproxy negotiates webp/avif (auto-format)" || echo "no file change — runtime/container fix only, nothing to commit"
```

### Task A7: Workstream A acceptance gate

- [ ] **Step 1: Full mobile measurement /en + /en/blog**

Run the verification command for both. **Acceptance:** `/en` mobile LCP meaningfully below baseline (target <1.5s here; <1.2s reached after B). Record numbers in the commit message of the next task or a note.

- [ ] **Step 2: Visual regression check**

Playwright screenshots of `/en` and `/en/blog`; compare to `/tmp/lcp-before-*.png`. Expected: visually identical layout (images present, same composition).

---

## Workstream B — Static-first public pages

### Task B1: Defer-hydrate the Search and PostPager islands

Both are client islands rendered inside the RSC `<Render>`. They are not above the fold on first paint; their JS should not download/parse until after LCP. Wrap them in a tiny "hydrate on idle/visible" boundary.

**Files:**
- Create: `packages/puck-config/src/components/lazy-hydrate.tsx`
- Modify: `packages/puck-config/src/render.tsx` (Search render ~line 122; PostList paginated branch already dynamic-imports PostPager in `post-list.tsx`)
- Modify: `packages/puck-config/src/post-list.tsx` (wrap PostPager)

- [ ] **Step 1: Create a `LazyHydrate` boundary**

`packages/puck-config/src/components/lazy-hydrate.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Renders `placeholder` (server HTML stays as-is) and only mounts `children`
 * once the element is near the viewport or the browser is idle — so island JS
 * never competes with the LCP paint. Progressive enhancement: without JS the
 * placeholder remains usable where it is itself a working control.
 */
export function LazyHydrate({ children, placeholder }: { children: ReactNode; placeholder: ReactNode }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveal = () => setShow(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          reveal();
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    const idle = (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500)))(reveal);
    return () => {
      io.disconnect();
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle as number);
    };
  }, []);

  return <div ref={ref}>{show ? children : placeholder}</div>;
}
```

- [ ] **Step 2: Defer the Search island in `render.tsx`**

Replace the Search component render:

```tsx
Search: {
  render: ({ placeholder }) => {
    if (typeof window === 'undefined') {
      // server: emit a plain styled input placeholder (no JS); enhanced on the client
      return (
        <input
          type="search"
          placeholder={placeholder || 'Search…'}
          style={{ width: '100%', maxWidth: 480, padding: '10px 14px', borderRadius: 8, border: '1px solid #ccc', fontSize: 16 }}
          readOnly
        />
      );
    }
    const { LazyHydrate } = require('./components/lazy-hydrate.js');
    const placeholderEl = (
      <input
        type="search"
        placeholder={placeholder || 'Search…'}
        style={{ width: '100%', maxWidth: 480, padding: '10px 14px', borderRadius: 8, border: '1px solid #ccc', fontSize: 16 }}
        readOnly
      />
    );
    return (
      <LazyHydrate placeholder={placeholderEl}>
        <SearchBox placeholder={placeholder || 'Search…'} />
      </LazyHydrate>
    );
  },
},
```

> Note: the existing Search render imports `SearchBox` from `./components/search-box.js`. Keep that import. `require()` is used for `LazyHydrate` to avoid pulling the client module into the RSC server bundle; if the project's bundler rejects `require` in this ESM module, use a top-level `import { LazyHydrate } from './components/lazy-hydrate.js';` instead and rely on the `'use client'` boundary.

- [ ] **Step 3: Defer the PostPager in `post-list.tsx`**

The paginated branch dynamic-imports `PostPager`. Wrap its render so the pager controls hydrate lazily while the initial server-rendered cards stay static. In `post-list.tsx`, the initial posts grid is already server HTML; ensure only the pager (Prev/Next buttons) is the client island. If `PostPager` currently renders the grid too, split it: render the first-page cards with the server `PostCard` grid, and pass only pagination state to a lazily-hydrated control. Minimal change: leave `PostPager` as-is but it already receives server-rendered `initial` — acceptable. Confirm the grid HTML is present without JS:

```bash
curl -s http://localhost:3000/en/blog | grep -c "PostCard\|article\|<a href=\"/en/blog/"
```
Expected: ≥3 (cards in server HTML). If yes, no split needed for this task.

- [ ] **Step 4: Typecheck + build + restart + flush + measure**

```bash
pnpm --filter @cms/puck-config typecheck && pnpm --filter @cms/puck-config build && pnpm --filter web typecheck
```
Rebuild/restart/flush, then run verification for `/en` and `/en/blog`. Also check JS:

```bash
node -e "const r=require('/tmp/m.json');const a=r.audits['unused-javascript'];console.log('unused-js savings',a&&a.details?Math.round((a.details.overallSavingsBytes||0)/1024)+'KB':'n/a');"
```
Expected: unused-js savings drop vs baseline; INP/TBT still green; search input visible and usable (focus → hydrates → live results).

- [ ] **Step 5: Commit**

```bash
git add packages/puck-config/src/components/lazy-hydrate.tsx packages/puck-config/src/render.tsx packages/puck-config/src/post-list.tsx
git commit -m "perf(puck): defer-hydrate search/pager islands off the LCP critical path"
```

### Task B2: Defer the vitals reporter to idle

**Files:**
- Modify: `apps/web/src/components/vitals-reporter.tsx`

- [ ] **Step 1: Gate the web-vitals import behind idle/after-load**

Wrap the existing `useEffect` body so the `import('web-vitals')` only runs once the page is idle (after LCP). Change the start of the effect to:

```tsx
useEffect(() => {
  const start = () => {
    const sample = Number(process.env.NEXT_PUBLIC_VITALS_SAMPLE ?? '1');
    if (Math.random() >= sample) return;
    // ... existing body (queue, device, connection, flush, import('web-vitals')...) ...
  };
  const idle = (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000)))(start);
  return () => {
    if (window.cancelIdleCallback) window.cancelIdleCallback(idle as number);
  };
}, []);
```

(Move the current effect body into `start()`. web-vitals' `onLCP` etc. still capture the metric correctly when registered shortly after load — the library buffers the LCP entry.)

- [ ] **Step 2: Typecheck + rebuild + restart + flush + measure /en mobile**

```bash
pnpm --filter web typecheck
```
Rebuild/restart/flush, run verification. Expected: no regression; vitals still POST to `/api/vitals` (check `/tmp/web3000.log` or network after a manual visit).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/vitals-reporter.tsx
git commit -m "perf(web): defer web-vitals import to idle so it never competes with LCP"
```

### Task B3: Slim repeated inline styles into a static stylesheet

The render components emit large inline-style objects per element, bloating HTML and forcing per-element style recalc. Extract the stable ones into a single static stylesheet of small classes, injected once in the public layout. Keep visuals identical.

**Files:**
- Create: `packages/puck-config/src/render.css.ts` (a string of CSS classes) — co-located with the render config
- Modify: `apps/web/src/app/s/[siteId]/[locale]/layout.tsx` (inject the stylesheet once in `<head>`)
- Modify: `packages/puck-config/src/render.tsx` (swap the heaviest repeated inline styles for `className`)

- [ ] **Step 1: Create the stylesheet string**

`packages/puck-config/src/render.css.ts`:

```ts
/** Static CSS for public render components — injected once per page instead of
 *  repeating large inline-style objects on every element (smaller HTML, faster
 *  style recalc, cacheable). Class names are prefixed `pk-` to avoid collisions. */
export const renderCss = `
.pk-card{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;border:1px solid #e6e8f0;background:#fff;text-decoration:none;color:inherit;height:100%;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.pk-card-img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#eef1f6}
.pk-card-body{padding:20px;display:flex;flex-direction:column;gap:8px;flex:1}
.pk-card-h{margin:0;font-size:1.2rem;line-height:1.25;letter-spacing:-.2px}
.pk-card-p{margin:0;color:#5b6072;line-height:1.55;font-size:15px;flex:1}
.pk-card-meta{color:#8a90a2;font-size:13px;margin-top:4px}
.pk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
`;
```

- [ ] **Step 2: Export `renderCss` from the package index**

In `packages/puck-config/src/index.ts` add:

```ts
export { renderCss } from './render.css.js';
```

- [ ] **Step 3: Inject once in the public layout**

In `apps/web/src/app/s/[siteId]/[locale]/layout.tsx`, import and add a `<style>` in `<head>` next to the existing `globalCss` style:

```tsx
import { renderCss } from '@cms/puck-config';
// ...in <head>, after the existing globalCss <style>:
<style dangerouslySetInnerHTML={{ __html: renderCss }} />
```

- [ ] **Step 4: Switch PostCard to classes**

In `packages/puck-config/src/post-card.tsx`, replace the inline `style={...}` objects with the `pk-*` classes (`pk-card`, `pk-card-img`, `pk-card-body`, `pk-card-h`, `pk-card-p`, `pk-card-meta`) and `postGridStyle` consumers with `className="pk-grid"`. Keep the `<img>` src/srcSet/sizes attributes unchanged. Update `post-list.tsx` and `post-pager.tsx` to use `className="pk-grid"` instead of `style={postGridStyle}`.

- [ ] **Step 5: Typecheck + build + restart + flush + visual check**

```bash
pnpm --filter @cms/puck-config typecheck && pnpm --filter @cms/puck-config build && pnpm --filter web typecheck
```
Rebuild/restart/flush. Playwright screenshot `/en/blog`; compare to `/tmp/lcp-before-blog.png`. **Acceptance: pixel-equivalent** (cards look identical). Measure `/en/blog` mobile — expect HTML transfer down, perf still 100.

- [ ] **Step 6: Commit**

```bash
git add packages/puck-config/src/render.css.ts packages/puck-config/src/index.ts packages/puck-config/src/post-card.tsx packages/puck-config/src/post-list.tsx packages/puck-config/src/components/post-pager.tsx "apps/web/src/app/s/[siteId]/[locale]/layout.tsx"
git commit -m "perf(puck): extract repeated card/grid inline styles to a static stylesheet"
```

### Task B4: Workstream B acceptance gate

- [ ] **Step 1: Full mobile measurement /en + /en/blog**

Run verification for both. **Acceptance: `/en` mobile LCP < 1.2s**, perf ≥98, CLS 0, TBT/INP green. If LCP is still ≥1.2s, capture the phase breakdown and the top opportunities, and iterate on the dominant phase (most likely remaining: image decode → try AVIF vs WebP A/B, or smaller `sizes`).

- [ ] **Step 2: Desktop no-regression check**

```bash
pnpm exec lhci collect --url=http://localhost:3000/en --url=http://localhost:3000/en/about --numberOfRuns=1 --settings.preset=desktop
```
Expected: desktop perf/seo/a11y/bp all ≥ their budgets (still ~100).

---

## Workstream C — Mobile CI gate

### Task C1: Add a mobile Lighthouse config

**Files:**
- Create: `lighthouserc.mobile.json`

- [ ] **Step 1: Create the mobile config**

`lighthouserc.mobile.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/en", "http://localhost:3000/en/blog"],
      "numberOfRuns": 3,
      "settings": { "skipAudits": ["uses-http2"], "throttlingMethod": "devtools" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1500 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

(No `preset: desktop` → Lighthouse defaults to mobile. LCP budget 1500ms gives margin over the <1.2s target while absorbing CI-runner variance.)

- [ ] **Step 2: Verify locally against the running stack**

```bash
pnpm exec lhci autorun --config=lighthouserc.mobile.json
```
Expected: assertions pass (LCP < 1500ms on both URLs).

- [ ] **Step 3: Commit**

```bash
git add lighthouserc.mobile.json
git commit -m "test(perf): mobile lighthouse config (LCP<=1.5s budget)"
```

### Task C2: Wire imgproxy + MinIO + mobile run into CI

The mobile gate must render real images. Reintroduce media into the lighthouse job as **service containers** (hardened, with explicit fail-on-404), reversing the `SEED_SKIP_MEDIA` workaround for this job only.

**Files:**
- Modify: `.github/workflows/ci.yml` (lighthouse job)

- [ ] **Step 1: Add minio + imgproxy service containers**

In the `lighthouse` job `services:` block (alongside postgres + redis), add:

```yaml
      minio:
        image: bitnami/minio:latest
        ports: ["9000:9000"]
        env:
          MINIO_ROOT_USER: minioadmin
          MINIO_ROOT_PASSWORD: minioadmin
          MINIO_DEFAULT_BUCKETS: cms-media
      imgproxy:
        image: darthsim/imgproxy:latest
        ports: ["8081:8080"]
        env:
          IMGPROXY_KEY: "00"
          IMGPROXY_SALT: "00"
          IMGPROXY_AUTO_WEBP: "true"
          IMGPROXY_AUTO_AVIF: "true"
          IMGPROXY_USE_S3: "true"
          IMGPROXY_S3_ENDPOINT: http://minio:9000
          IMGPROXY_S3_REGION: us-east-1
          AWS_ACCESS_KEY_ID: minioadmin
          AWS_SECRET_ACCESS_KEY: minioadmin
```

(Service containers share a network and resolve each other by service name, so `imgproxy` reaches `minio:9000`. `bitnami/minio` starts its server and creates the bucket from `MINIO_DEFAULT_BUCKETS`; `darthsim/imgproxy` starts its server by default — both work without a command override, unlike `minio/minio`.)

- [ ] **Step 2: Remove the SEED_SKIP_MEDIA workaround for this job**

Change the migrate/seed line back to seeding WITH media:

```yaml
      - run: pnpm db:migrate && pnpm db:seed
```

- [ ] **Step 3: Add a wait-and-verify step (fail loudly if images 404)**

After `Start web` and before the Lighthouse step, add:

```yaml
      - name: Verify media pipeline serves images (fail if 404)
        run: |
          timeout 30 bash -c 'until curl -sf http://localhost:9000/minio/health/live; do sleep 1; done'
          url=$(curl -s http://localhost:3000/en | grep -oE 'http://localhost:8081/[A-Za-z0-9_-]+/[^" ]+\.webp' | head -1)
          echo "probe: $url"
          test -n "$url" || { echo "no imgproxy image URL on /en"; exit 1; }
          code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
          echo "image status: $code"
          test "$code" = "200" || { echo "imgproxy image did not serve (got $code)"; exit 1; }
```

- [ ] **Step 4: Add the mobile lighthouse run step**

After the existing desktop `Lighthouse CI` step, add:

```yaml
      - name: Lighthouse CI — mobile (LCP budget)
        run: pnpm exec lhci autorun --config=lighthouserc.mobile.json
```

- [ ] **Step 5: Validate YAML + commit + push**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"
git add .github/workflows/ci.yml
git commit -m "ci: mobile lighthouse gate with real images (minio+imgproxy service containers)"
git push -u origin perf/mobile-lcp
```

- [ ] **Step 6: Watch the run; confirm both desktop and mobile lighthouse pass**

```bash
gh run list --branch perf/mobile-lcp --limit 1
# then: gh run view <id>  → integration ✓ check ✓ lighthouse ✓
```
Expected: all green. If the mobile run fails on LCP, the budget is the CI-runner-adjusted reality — re-measure locally, and either tighten the source fix or document the CI-runner delta (do NOT silently raise the budget without a measured reason).

---

## Final: open PR

- [ ] **Step 1: Open the PR**

```bash
gh pr create --base main --head perf/mobile-lcp \
  --title "perf: mobile LCP <1.2s (image pipeline + static-first + mobile CI gate)" \
  --body "Implements docs/superpowers/specs/2026-06-12-mobile-lcp-optimization-design.md. Before: mobile LCP 2.6s. After: <1.2s (record final). Desktop unchanged. New mobile Lighthouse CI gate."
```

---

## Self-Review Notes

- **Spec coverage:** A1–A6 cover spec Workstream A (right-size, modern format, paint-fast LCP, hero bg, preload). B1–B3 cover Workstream B (defer search/pager, defer vitals, slim styles) per the constraint-adjusted design. C1–C2 cover Workstream C (mobile config + real-image CI gate). Verification protocol + visual checks are in Task 0 and each acceptance gate.
- **Architecture constraints honored:** no `?page=N` (static cache), no `/search` route (proxy fast-404) — B uses deferred hydration instead.
- **Type consistency:** `buildSrcSet`, `SIZES_HERO`, `SIZES_CARD`, `SIZES_CONTENT`, `RESPONSIVE_WIDTHS` defined in A1 and used in A2/A3/A5; `renderCss` defined in B3 and exported once; `LazyHydrate` defined in B1 and used in render.tsx.
- **Open risk flagged in C2 Step 6:** CI-runner LCP variance vs local — budget set to 1500ms (margin over <1.2s target) and the step says not to raise it without a measured reason.
