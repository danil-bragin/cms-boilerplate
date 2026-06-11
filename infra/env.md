# Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | api, worker, web, db scripts | Postgres connection string. Web uses it for the read path (published_pages). |
| `REDIS_URL` | api, worker | BullMQ + app cache connection. |
| `REDISHOST` / `REDISPORT` | web | Consumed by `@trieb.work/nextjs-turbo-redis-cache` (shared ISR cache). |
| `S3_ENDPOINT` | api, worker | S3-compatible endpoint (MinIO in dev, real S3 in prod — leave empty for AWS default). |
| `S3_REGION` | api, worker | Bucket region. |
| `S3_BUCKET` | api, worker, web | Media bucket name. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | api, worker | Credentials. In k8s prefer IRSA/instance roles and omit. |
| `S3_FORCE_PATH_STYLE` | api, worker | `true` for MinIO; `false`/unset for AWS S3. |
| `KEYCLOAK_ISSUER` | web, api, worker | Realm issuer URL; JWKS derived from it. |
| `KEYCLOAK_WEB_CLIENT_ID` | web | Public OIDC client for the admin UI (PKCE). |
| `KEYCLOAK_API_AUDIENCE` | api | Expected `aud` claim in access tokens. |
| `SESSION_SECRET` | web | 32-byte hex; AES key for the encrypted session cookie. |
| `REVALIDATE_SECRET` | api, worker, web | HMAC key signing `/api/revalidate` calls. |
| `IMGPROXY_URL` | web | Public base URL of imgproxy. |
| `IMGPROXY_KEY` / `IMGPROXY_SALT` | web | Hex pair for signing imgproxy URLs; must match the imgproxy container env. |
| `API_URL` | web (server) | Internal URL of the Nest API. |
| `WEB_INTERNAL_URL` | api, worker | Internal URL of the Next app (revalidation calls). |
| `NEXT_PUBLIC_API_URL` | web (client) | API URL for browser-side admin calls. |
| `NEXT_PUBLIC_SITE_URL` | web | Canonical site origin for metadata/hreflang. |
| `API_PORT` | api | HTTP port (default 3001). |

Dev quickstart: `cp .env.example .env && docker compose -f infra/docker-compose.yml up -d`.
Generate real secrets: `openssl rand -hex 32`.

## Optional

| Variable | Used by | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | web, api, worker | OTLP collector URL (e.g. `http://localhost:4318` for the compose Jaeger). Unset = tracing fully disabled, zero overhead. |
| `OTEL_SERVICE_NAME` | web, api, worker | Override the default service names (`cms-web` / `cms-api` / `cms-worker`). |

Observability quickstart: `docker compose -f infra/docker-compose.yml --profile observability up -d jaeger`,
set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, open http://localhost:16686.
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | api, worker | Metrics OTLP target. NB: signal-specific endpoints are used **as-is** — include the full `/api/v1/otlp/v1/metrics` path for Prometheus. |
| `CDN_PROVIDER` | api, worker | `cloudflare` \| `cloudfront` \| unset. Enables edge purge on publish. |
| `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN` | worker | Cloudflare purge-by-URL credentials. |
| `CLOUDFRONT_DISTRIBUTION_ID` | worker | CloudFront invalidation target (uses ambient AWS credentials/IRSA). |
| `NEXT_PUBLIC_VITALS_SAMPLE` | web (client) | RUM sampling rate 0..1 (default 1). Beacons land at `/api/vitals` → OTel histograms `web_vitals_*`. |

## Search Console (optional, per-site)

Configured in site settings (not env): paste a Google service-account JSON in
the admin Search Console page. The SA's `client_email` must be added as a user
of the GSC property. Unconfigured sites return `{configured:false}` — no-op.
Quota: 2000 URL inspections/day, 600/min per property.

## Required (additional — added by later features)

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | web | **REQUIRED & identical across all web replicas.** Encrypts server-action payloads; per-pod keys break admin actions intermittently behind a load balancer. `openssl rand -base64 32`. |
| `WEB_ORIGINS` | api | Comma-separated allowed CORS origins (default `http://localhost:3000`). Set to the real admin origin(s) or admin browser calls are blocked. |
| `PG_POOL_MAX` | api, worker, web | Per-pool max PG connections (default 10). Size against (replicas × pools/pod) vs Postgres `max_connections`; add PgBouncer past ~7 web replicas. |
| `NEXT_PUBLIC_IMGPROXY_URL` | web (client) | Public imgproxy origin for preconnect/CSP (falls back to `IMGPROXY_URL`). |
| `REDIS_COMMAND_TIMEOUT_MS` | web | Cache-handler Redis GET timeout (default 200 via cache-handler.mjs). |
