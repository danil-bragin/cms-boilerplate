# syntax=docker/dockerfile:1
FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
COPY packages/auth/package.json packages/auth/
RUN pnpm install --frozen-lockfile --filter api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @cms/db --filter @cms/contracts --filter @cms/auth build && pnpm --filter api build

FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
COPY packages/auth/package.json packages/auth/
RUN pnpm install --frozen-lockfile --prod --filter api...

FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=app:app /repo/packages ./packages
COPY --from=build --chown=app:app /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /repo/apps/api/package.json ./apps/api/
USER app
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
