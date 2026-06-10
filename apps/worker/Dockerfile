# syntax=docker/dockerfile:1
FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter worker...
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm --filter @cms/db build && pnpm --filter worker build

FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --prod --filter worker...

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# sharp on glibc: jemalloc avoids allocator fragmentation under load
RUN apt-get update && apt-get install -y --no-install-recommends libjemalloc2 && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/lib/*/libjemalloc.so.2 /usr/local/lib/libjemalloc.so.2 \
  && groupadd -r app && useradd -r -g app app
ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so.2
COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=app:app /repo/packages ./packages
COPY --from=build --chown=app:app /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=app:app /repo/apps/worker/package.json ./apps/worker/
USER app
CMD ["node", "apps/worker/dist/main.js"]
