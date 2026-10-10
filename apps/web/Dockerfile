# syntax=docker/dockerfile:1
#
# AgroRende admin web image and migration image (T18, ARCHITECTURE §18.2).
#
#   docker build -f apps/web/Dockerfile --target runner  -t agrorende-web .
#   docker build -f apps/web/Dockerfile --target migrate -t agrorende-migrate .
#
# `runner` is the Next.js standalone server (`node apps/web/server.js`). `migrate` runs
# packages/db/migrations/runner.ts (the same code as `pnpm db:migrate`) once and exits; deploy.yml
# runs it before the new web, realtime and worker containers start.
#
# NEXT_PUBLIC_REALTIME_URL is read by the server at request time and rendered into the page
# (change request T18-003), so the same image digest runs on staging and production.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /repo

FROM base AS source
COPY . .

FROM source AS builder
ARG NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
ARG NEXT_PUBLIC_MAP_STYLE_DARK_URL=https://tiles.openfreemap.org/styles/dark
ENV NEXT_PUBLIC_MAP_STYLE_URL=${NEXT_PUBLIC_MAP_STYLE_URL} \
    NEXT_PUBLIC_MAP_STYLE_DARK_URL=${NEXT_PUBLIC_MAP_STYLE_DARK_URL} \
    NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod=false --filter "web..."
# The Playwright suite and config are test-only and not part of the server, so they are dropped
# before `next build` type-checks the app.
RUN rm -rf apps/web/e2e apps/web/playwright.config.ts \
 && mkdir -p apps/web/public \
 && pnpm --filter web run build
# The standalone output keeps the monorepo layout: server.js lives in apps/web and the traced
# node_modules sit at the root of the standalone folder.
RUN mkdir -p /out \
 && cp -R apps/web/.next/standalone/. /out/ \
 && mkdir -p /out/apps/web/.next \
 && cp -R apps/web/.next/static /out/apps/web/.next/static \
 && cp -R apps/web/public /out/apps/web/public \
 && test -f /out/apps/web/server.js

FROM source AS migrate-builder
RUN pnpm install --frozen-lockfile --filter "@agrorende/db..."
RUN node infra/docker/bundle.mjs migrate /bundle
RUN pnpm deploy --filter @agrorende/db --prod --ignore-scripts --config.inject-workspace-packages=true /out \
 && find /out -mindepth 1 -maxdepth 1 ! -name node_modules ! -name package.json -exec rm -rf {} + \
 && cp -R /bundle/. /out/ \
 && node infra/docker/prune-node-modules.mjs /out/externals.json /out \
 && node infra/docker/verify-externals.mjs /out/externals.json /out/dist

FROM ${NODE_IMAGE} AS runtime-base
# npm, npx, corepack and yarn are not needed at runtime.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM runtime-base AS migrate
COPY --from=migrate-builder /out /app
USER node
CMD ["node", "--enable-source-maps", "dist/migrate.mjs"]

FROM runtime-base AS runner
ENV PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MEDIA_ROOT=/data/media
COPY --from=builder /out /app
RUN mkdir -p /data/media/.tmp && chown -R node:node /data
VOLUME ["/data/media"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
