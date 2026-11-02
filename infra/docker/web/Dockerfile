# syntax=docker/dockerfile:1
# Kazuist web (Next.js standalone). Build context: repository root.
#   docker build -f infra/docker/web/Dockerfile -t kazuist-web .
# Multi-stage; the runtime stage runs as the unprivileged "node" user (plan 5.6/8, wt.80).

ARG NODE_IMAGE=node:26.12.0-trixie-slim
ARG PNPM_VERSION=11.0.8

FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches ./patches
COPY apps ./apps
COPY packages ./packages
COPY content ./content
RUN pnpm install --frozen-lockfile --filter "@kazuist/web..."

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @kazuist/web build \
 && mkdir -p apps/web/public

FROM ${NODE_IMAGE} AS runtime
ARG GIT_COMMIT=unknown
ARG BUILT_AT=1970-01-01T00:00:00.000Z
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    GIT_COMMIT=${GIT_COMMIT} \
    BUILT_AT=${BUILT_AT} \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
