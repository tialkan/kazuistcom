# syntax=docker/dockerfile:1
# Kazuist worker-node (jobs consumer) and the one-shot "migrate" target. Build context: repository root.
#   docker build -f infra/docker/worker-node/Dockerfile -t kazuist-worker-node .
#   docker build -f infra/docker/worker-node/Dockerfile --target migrate -t kazuist-migrate .
# The worker runs the esbuild bundle dist/main.js (no tsx); npm dependencies come from `pnpm deploy --prod`.

ARG NODE_IMAGE=node:26.12.0-trixie-slim
ARG PNPM_VERSION=11.0.8

FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker-node ./apps/worker-node
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter "@kazuist/worker-node..." \
 && rm -rf packages/*/test apps/worker-node/test

FROM deps AS build
RUN pnpm --filter @kazuist/worker-node build \
 && pnpm --filter @kazuist/worker-node deploy --prod --legacy /out \
 && rm -rf /out/src /out/test /out/scripts \
 && cp -r apps/worker-node/dist /out/dist

FROM ${NODE_IMAGE} AS base-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /repo ./

# One-shot migration step (plan 14.4/3): runs before the app starts, logs every step, exits non-zero on failure.
FROM base-runtime AS migrate
COPY --chown=node:node infra/scripts/migrate.mjs ./infra/scripts/migrate.mjs
USER node
CMD ["node", "infra/scripts/migrate.mjs"]

FROM ${NODE_IMAGE} AS runtime
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production GIT_COMMIT=${GIT_COMMIT}
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
CMD ["node", "dist/main.js"]
