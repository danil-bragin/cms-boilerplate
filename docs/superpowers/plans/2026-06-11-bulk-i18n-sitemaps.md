# Bulk ops + admin i18n + news/image sitemaps (2026-06-11)

## A. Bulk operations
- API: POST /sites/:siteId/pages/bulk { action, pageLocaleIds[]|pageIds[] }
  actions: publish (latest version each), unpublish, delete, add-locale
  - per-item result {id, ok, error}; site-access asserted once per site;
    all run server-side, parallelized with a concurrency cap
- admin pages list: checkbox column + sticky bulk bar
  (Publish latest / Unpublish / Delete / Add locale X)
- invalidation batched (collect tags, one revalidate call)

## B. Admin i18n
- next-intl (App Router, server+client). Messages: en + ru seed (cover admin UI
  strings). Locale from a cookie `admin_locale` (default en), switcher in header.
- admin layout becomes a NextIntlClientProvider boundary; extract hardcoded
  strings in admin components to t() keys. Public site untouched.
- keep it scoped: wrap /admin only; messages/{en,ru}.json.

## C. News + image sitemaps
- News sitemap: /news-sitemap.xml — posts published in last 48h
  (Google News <news:news>: publication name from site/org, language, pub date,
  title). Linked from robots + sitemap index.
- Image sitemap data: extend the main sitemap urls with <image:image><image:loc>
  for each page's images (extract image s3Keys from puck_data → imgproxy URLs).
  Bounded (max ~1000 imgs/url per spec). Add xmlns:image.
- robots.txt: add News sitemap line.

## Verify: build, api tests (bulk), typecheck, e2e, manual smoke each.
