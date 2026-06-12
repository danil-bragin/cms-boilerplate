# Same-Origin Cached Image Layer — Design

**Date:** 2026-06-12
**Status:** Approved, pending implementation plan

## Problem

Mobile LCP is 1.4s (devtools/real); ~99% of it is image delivery:
`Load Delay 574ms` (a new cross-origin TCP connection to imgproxy `:8081` under
slow 4G) + `Load Time 813ms` (imgproxy re-encodes every request — it has no
internal cache). Everything else (render delay, TBT, CLS) is already solved.

imgproxy's own docs state a cache in front (CDN or nginx reverse proxy) is
mandatory — "imgproxy has no internal cache; each request consumes the same CPU."
This boilerplate fronts only the web app with nginx; public images go straight to
imgproxy cross-origin and uncached. That omission is the entire remaining LCP.

## Goal / Success Criteria

Serve public images **same-origin** through nginx with `proxy_cache` in front of
imgproxy:
- Load Delay collapses (reuse the warm HTTP/2 connection already open for the doc).
- Load Time collapses on cache hit (imgproxy encodes once, nginx caches).
- **Mobile LCP 1.4s → < 0.9s**, measured under a real nginx front (not bare `next start`).
- Zero-config `next dev`/`next start` (no nginx) keeps working — direct imgproxy fallback.
- AVIF stays viable (research: AVIF encode ~10× slower than WebP, but the cache pays it once).

## Approach

### 1. Source — env-gated image base

`packages/puck-config/src/image-url.ts`: the `imgproxy` mode already builds
`${baseUrl}/${signature}${path}`. No change to the signing — only where `baseUrl`
comes from.

`apps/web/src/lib/images.server.ts`: `configureImages({ ... baseUrl:
process.env.IMAGE_PUBLIC_BASE || process.env.IMGPROXY_URL ... })`. When
`IMAGE_PUBLIC_BASE=/img`, URLs are same-origin relative
(`/img/{sig}/rs:.../plain/s3://...`); the signature, computed over the path after
the sig, still validates because nginx forwards that exact path to imgproxy.

Preconnect: the cross-origin preconnect to imgproxy (`layout.tsx` `<link
rel="preconnect">` and the `Link: rel=preconnect` response header in
`next.config.ts`) is only useful for the direct-imgproxy path. When
`IMAGE_PUBLIC_BASE` is a same-origin path, drop both (the connection is already open).

### 2. Infra — nginx

`infra/nginx/nginx.conf`: add
```
location /img/ {
  rewrite ^/img/(.*)$ /$1 break;           # strip /img prefix
  proxy_pass http://imgproxy;              # upstream imgproxy:8080
  proxy_cache img_cache;
  proxy_cache_key "$scheme$proxy_host$uri$is_args$args$http_accept"; # Vary on Accept (avif/webp)
  proxy_cache_valid 200 1y;
  add_header Cache-Control "public, max-age=31536000, immutable";
  add_header X-Cache-Status $upstream_cache_status;
}
```
plus `proxy_cache_path` + an `imgproxy` upstream.

New compose service `nginx` (front on host `:8080`): `location /` →
`http://host.docker.internal:3000` (host-run web), `location /img/` →
`imgproxy:8080` (compose network). The measured/prod entry point is the nginx
port; same-origin `/img/...` resolves to it.

### 3. Verification

Lighthouse (mobile, devtools throttling) against `http://localhost:8080/en` with
`IMAGE_PUBLIC_BASE=/img`, compared to the 1.4s baseline. Confirm a second request
shows `X-Cache-Status: HIT` and Load Time drops toward 0. Visuals unchanged.

### 4. CSP / cache invalidation

- `img-src 'self'` covers `/img`; keep the imgproxy origin in `img-src` for the
  direct-mode fallback.
- Signed URLs are immutable (key + ops + s3Key). Real uploads use unique uuid keys
  → immutable-safe. The demo seed reuses keys (dev-only) — documented.

## Risks / Tradeoffs

- nginx → host web via `host.docker.internal` works on Mac/Windows; on Linux it
  needs `extra_hosts: host-gateway`. Add it so the compose service is portable.
- The CI mobile gate can stay on the direct-imgproxy path (the env gate makes
  same-origin opt-in) — fronting CI with nginx is out of scope here.
- A Node/imgproxy hop is added per cold image, but the nginx cache serves repeats;
  net is faster, matching imgproxy's documented production architecture.

## Measurement finding (during implementation) — inline LCP is the real lever

Same-origin + cache are architecturally correct (imgproxy's documented prod
pattern; verified: nginx `X-Cache-Status` MISS→HIT, signatures still validate) and
help the real field. But the **synthetic Lighthouse slow-4G LCP stayed 1.4s**: the
waterfall showed the LCP image is a *separate request* that (a) can't start until
the document downloads (~620ms under throttle) and (b) shares the throttled pipe
with ~110KB of React/Next framework JS (`react-dom`+`scheduler`, not cuttable
without dropping interactivity). Origin/encode were never the lab bottleneck.

The lever that moves it: **inline the above-the-fold LCP image as a data-URI** so
it arrives with the document — no gated request. `seed-media` generates a small
(~640px AVIF, ≈5KB) `lcpInline` data-URI per image; the seed attaches it to the
hero's media ref only (via `lcpMediaRef`, so other images don't bloat the HTML);
the Hero render uses it as `src` (no srcset) when present. Measured under nginx:
**mobile LCP 1.4s → 0.7s, perf 100, CLS 0** (doc +~3KB). Real uploads would have
the media worker populate `lcpInline` for above-the-fold images.

## Out of Scope

- CDN configuration (documented as the prod extension; nginx cache is the local/self-host equivalent).
- Bundle-size / JS reduction (separate, lower-ROI lever).
- Brotli for images (images are already compressed; brotli is for HTML/JS, already in nginx.conf).
