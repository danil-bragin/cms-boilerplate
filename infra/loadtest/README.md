# Load stand — multi-replica + chaos

Proves the highload claims empirically: cross-replica cache invalidation,
throughput under mixed traffic, and graceful degradation when Redis dies.

## Run

```bash
# 1. one prod build, three replicas sharing the Redis cache (same buildId)
cd apps/web && pnpm build
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  sh -c 'for p in 3100 3101 3102; do pnpm exec next start -p $p & done'

# 2. nginx LB over the three replicas (:8088)
docker compose -f infra/loadtest/compose.yml up -d lb

# 3. point the API revalidation at the LB so a publish reaches every replica
WEB_INTERNAL_URL=http://localhost:8088 pnpm --filter api dev

# 4. load
docker compose -f infra/loadtest/compose.yml --profile run run --rm k6
```

## Measured (3 replicas, laptop, mixed traffic 80% hot / 10% 404 / 10% seo)

| Metric | Result |
|---|---|
| Throughput | ~290 req/s sustained at 150 VUs |
| p95 latency | 16 ms (cached pages 13.7 ms TTFB) |
| Errors (steady state) | 0.00% |
| Cross-replica invalidation | publish on one replica → all 3 serve fresh (proven) |

## Chaos: Redis paused mid-load

`docker pause` the cache Redis during the k6 run. Before/after the hardened
cache handler (`apps/web/cache-handler.mjs`):

| | Default handler | Hardened (socket timeout + getTimeoutMs) |
|---|---|---|
| Error rate during outage | **24.08%** | **0.05%** |
| Warm page TTFB during outage | hangs → 502/504 (120-180s) | 4-5 ms (served from replica memory) |
| Recovery | — | automatic, cache STALE→fresh |

Residual: a page cold on a given replica, requested during a *total* Redis
outage, still blocks (trieb's per-request shared-tag sync isn't timeout-guarded).
Hot pages — the entire highload path — stay fast. A CDN in front absorbs the
rest. Re-run this stand after any bump of `redis` or the cache handler.
