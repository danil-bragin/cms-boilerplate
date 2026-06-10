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
