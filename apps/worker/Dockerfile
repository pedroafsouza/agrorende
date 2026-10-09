# syntax=docker/dockerfile:1
#
# AgroRende worker image (T18, ARCHITECTURE §10 and §18.2).
#
#   docker build -f apps/worker/Dockerfile -t agrorende-worker .
#
# The builder installs the workspace with the frozen lockfile, bundles the TypeScript sources with
# esbuild (infra/docker/bundle.mjs) and runs `pnpm deploy --filter worker --prod` for the runtime
# dependencies. The worker resolves peer job modules and the Apple revoke handler by path from
# apps/worker/src/jobs, so /app mirrors the repository layout (change request T18-002). The runner is node:24-bookworm-slim, runs as the `node` user and reads every setting
# from the environment at start. No .env file is ever copied into the image.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate
WORKDIR /repo

FROM base AS builder
COPY . .
# The root .dockerignore only matches top-level folders, so nested node_modules, env files and media
# folders from a developer checkout are removed before installing (change request T18-001). The
# builder stage is never shipped; only /out reaches the runner.
RUN sh infra/docker/clean-context.sh
RUN pnpm install --frozen-lockfile --filter "worker..."
RUN node infra/docker/bundle.mjs worker /bundle
RUN pnpm deploy --filter worker --prod --legacy --ignore-scripts /out \
 && find /out -mindepth 1 -maxdepth 1 ! -name node_modules ! -name package.json -exec rm -rf {} + \
 && cp -R /bundle/. /out/ \
 && node infra/docker/prune-node-modules.mjs /out/externals.json /out \
 && node infra/docker/verify-externals.mjs /out/externals.json /out/apps/worker/src/jobs

FROM ${NODE_IMAGE} AS runner
# npm, npx, corepack and yarn are not needed at runtime.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    WORKER_HEALTH_PORT=4002 \
    MEDIA_ROOT=/data/media
WORKDIR /app
COPY --from=builder /out /app
RUN mkdir -p /data/media/.tmp && chown -R node:node /data
VOLUME ["/data/media"]
USER node
EXPOSE 4002
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.WORKER_HEALTH_PORT || 4002) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "apps/worker/src/jobs/main.js"]
