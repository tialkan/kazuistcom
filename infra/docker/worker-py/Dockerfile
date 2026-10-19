# syntax=docker/dockerfile:1
# Kazuist worker-py. Build context: repository root.
#   docker build -f infra/docker/worker-py/Dockerfile -t kazuist-worker-py .
# uv resolves from uv.lock when present (frozen); the runtime stage runs as an unprivileged user.

ARG PYTHON_IMAGE=python:3.12-slim-trixie
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
COPY services/worker-py/ ./
RUN if [ -f uv.lock ]; then uv sync --frozen --no-dev; else uv sync --no-dev; fi \
 && rm -rf tests

FROM ${PYTHON_IMAGE} AS runtime
ARG GIT_COMMIT=unknown
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 GIT_COMMIT=${GIT_COMMIT}
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --from=build --chown=app:app /src /app
USER app
EXPOSE 8000
# Entry point module is owned by the worker-py module owners; see docs/istekler/altyapi-worker-giris-noktalari.md.
CMD ["python", "-m", "core.main"]
