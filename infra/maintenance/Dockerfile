# syntax=docker/dockerfile:1
# Static maintenance page (FR-105). Build context: repository root.
#   docker build -f infra/maintenance/Dockerfile -t kazuist-maintenance .
# nginx-unprivileged runs as uid 101 and listens on 8080. Every path returns the page with 503 and
# Retry-After, so crawlers do not index it and Traefik can use it as the error page for web.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim
COPY infra/maintenance/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/maintenance/index.html /usr/share/nginx/html/maintenance/index.html
EXPOSE 8080
