# Kubernetes reference

These manifests are a starting point, not a turnkey deployment. You supply:

- `cms-config` ConfigMap + `cms-secrets` Secret with the variables from `../env.md`,
  plus `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (any 32-byte base64 value, **identical
  on every web replica**).
- Postgres (managed or operator), Keycloak, S3 bucket.
- **Two Redis instances**: one for BullMQ (`maxmemory-policy noeviction`) and one
  for the Next.js page cache (`notify-keyspace-events Exe`, eviction policy of
  your choice — `allkeys-lru` is fine for a pure cache).
- Ingress: route `/` → `cms-web`, `/img/` (or a dedicated host) → `imgproxy`.
  The Nest API usually stays internal; expose it only if external clients need it.

## Scaling notes

| Component | Scaling rule of thumb |
|---|---|
| web | ~200–500 RPS per 1-CPU pod for cache-hit pages, ~50–150 RPS uncached. CPU-bound: scale replicas, not pod size. HPA on CPU 70% included. |
| api | Write-path only (editors + publish). 2 replicas for availability is usually plenty. |
| worker | Scale on queue depth (KEDA + BullMQ) if media uploads spike. |
| imgproxy | CPU-bound; CDN should absorb most traffic. Cache `/img/*` aggressively at the CDN. |
| Postgres | Watch `max_connections`: every web/api/worker replica holds a pool (10 by default). Add PgBouncer before you add replicas. |

## CDN

Put a CDN in front of `cms-web`. ISR pages are emitted with
`s-maxage, stale-while-revalidate` headers. On publish the API already calls
the internal revalidate endpoint (shared Redis cache → all replicas); for CDN-level
purge, extend `RevalidateClient` in `apps/api/src/publish/revalidate.client.ts` —
that is the single extension point for CloudFront/Cloudflare purge calls.
