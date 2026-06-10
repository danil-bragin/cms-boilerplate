# syntax=docker/dockerfile:1
FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
COPY packages/auth/package.json packages/auth/
COPY packages/puck-config/package.json packages/puck-config/
RUN pnpm install --frozen-lockfile --filter web...
COPY packages packages
COPY apps/web apps/web
# dummy values so build-time env validation passes; real values come at runtime
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    SESSION_SECRET=0000000000000000000000000000000000000000000000000000000000000000 \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
