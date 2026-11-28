# Interim kazuist.com until the full stack is live: static snapshot of / and /lansman (scripts/karsilama-snapshot.mjs).
FROM nginx:1.27-alpine
COPY infra/karsilama/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/karsilama/site /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
