# Operations

## Backup & disaster recovery

**What holds state:**

| Store | Contents | Loss impact |
|---|---|---|
| Postgres | all content: sites, pages, versions, published snapshots, redirects, menus, webhooks, media metadata | total — back this up |
| S3 bucket | media binaries | media gone; metadata orphans |
| Redis (cache) | page/data cache | none — refills from Postgres |
| Redis (queues) | in-flight BullMQ jobs, scheduled publishes' delayed jobs | media processing/seo pings retryable; **scheduled publish delayed jobs are lost** — see below |
| Keycloak DB | users, credentials | logins gone; run Keycloak against Postgres in prod, back up with it |

**Postgres:** continuous WAL archiving (managed services: PITR toggle; self-hosted:
wal-g/pgBackRest to S3) + nightly `pg_dump --format=custom`. Test restore quarterly:
`pg_restore --clean --if-exists -d cms backup.dump`.

**S3:** enable bucket versioning + lifecycle (expire noncurrent after 30d), and
cross-region replication if media loss is unacceptable. MinIO: `mc mirror --watch`
to a second target.

**Scheduled publishes after Redis loss:** rows in `scheduled_publishes` keep
status `pending` but their delayed jobs are gone. Recovery (manual or cron):
re-enqueue every pending row whose `publish_at` is in the future; publish
immediately any whose time passed:

```sql
SELECT id, page_locale_id, version_id, publish_at
FROM scheduled_publishes WHERE status = 'pending';
```

then POST `/page-locales/{id}/schedule` again (or publish directly via the API).

## Upgrade playbook

1. `pnpm outdated` / Renovate dashboard. Pinned-on-purpose:
   - `redis@4.7.0` (apps/web) — peer of the cache handler; bumping kills the
     page cache silently (hScan API change). Verify `x-nextjs-cache: HIT` after
     ANY change to it or to `@trieb.work/nextjs-turbo-redis-cache`.
   - `@puckeditor/core ~0.21` — pre-1.0, minors break; read the upgrade guide,
     run `migrate()` on stored page data if the Data shape changed.
2. `pnpm turbo build typecheck test` + `pnpm --filter e2e test` against the
   compose stack.
3. Lighthouse budgets gate the perf regressions in CI (`lhci autorun`).
4. DB migrations are forward-only (`drizzle-kit generate` → commit SQL →
   `db:migrate` runs in CI/CD before rollout). Never edit applied migrations.

## Rollout order

api+worker first (additive API changes), then web. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
must be identical across web replicas, including during the rollout window.

## Observability quickstart

```bash
docker compose -f infra/docker-compose.yml --profile observability up -d
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:9090/api/v1/otlp/v1/metrics pnpm dev
# Jaeger traces: http://localhost:16686 · Grafana: http://localhost:3030 (anonymous admin)
```

Alert on: API 5xx rate > 1%, p99 > 500ms, BullMQ queue depth growing for 10m,
Redis cache hit ratio drop (proxy for the redis-pin regression), Postgres
connections > 80% of max_connections.
