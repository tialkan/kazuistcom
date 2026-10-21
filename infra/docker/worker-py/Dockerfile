# syntax=docker/dockerfile:1
# Kazuist worker-py. Build context: repository root.
#   docker build -f infra/docker/worker-py/Dockerfile -t kazuist-worker-py .
# uv installs from uv.lock (frozen); the runtime stage runs as an unprivileged user.

ARG PYTHON_IMAGE=python:3.12-slim-trixie
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
COPY services/worker-py/ ./
RUN uv sync --frozen --no-dev \
 && rm -rf tests

FROM ${PYTHON_IMAGE} AS runtime
ARG GIT_COMMIT=unknown
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 GIT_COMMIT=${GIT_COMMIT}
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --no-create-home app
# Repository layout is kept (/srv/services/worker-py and /srv/docs/kaynaklar): core/sources.py reads the
# source registry from docs/kaynaklar relative to its own path.
WORKDIR /srv/services/worker-py
COPY --from=build /opt/venv /opt/venv
COPY --from=build --chown=app:app /src ./
COPY --chown=app:app docs/kaynaklar /srv/docs/kaynaklar
ENV KAZUIST_RAW_DIR=/srv/services/worker-py/.raw-store KAZUIST_SOURCES_DIR=/srv/docs/kaynaklar
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).status == 200 else 1)"]
CMD ["python", "-m", "core.main"]
