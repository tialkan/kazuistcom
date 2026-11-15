"""Worker entry point: python -m core.main (infra/docker/worker-py/Dockerfile).

Consumes the job types that have handlers in this service (ingest.fetch and mevzuat.rg_daily from
core.runtime, anon.run from anonymizer), wakes on LISTEN jobs_<type> and polls as a fallback, returns stale
locks of crashed workers, stops cleanly on SIGTERM (the job in hand finishes, nothing new is claimed) and
serves a liveness probe on KAZUIST_HEALTH_HOST:KAZUIST_HEALTH_PORT (default 127.0.0.1:8000) /healthz.

KAZUIST_SCHEDULER=on also starts the collection scheduler (core/scheduler.py; it enqueues list and daily jobs for
sources that are switched on and, in production, approved; KAZUIST_SCHEDULER_DRY_RUN=on only logs the plan).

Logs are JSON lines with error class names only: no payload, text or connection string.
(docs/istekler/altyapi-worker-giris-noktalari.md, ADR-0023.)
"""

from __future__ import annotations

import json
import os
import re
import signal
import sys
import threading
import time
from contextlib import AbstractContextManager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, Mapping, Optional

from .jobs import RELEASE_STALE_JOBS_SQL, ClaimedJob, Handler, JobConsumer, JobType

Log = Callable[..., None]


def json_log(msg: str, **extra: Any) -> None:
    print(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "svc": "worker-py", "msg": msg,
                      **extra}), flush=True)


class Heartbeat:
    """Liveness: the loop beats every round; stale beyond max_age seconds means stuck."""

    def __init__(self, max_age: float, clock: Callable[[], float] = time.monotonic):
        self.max_age = max_age
        self.clock = clock
        self.last = clock()

    def beat(self) -> None:
        self.last = self.clock()

    def alive(self) -> bool:
        return self.clock() - self.last <= self.max_age


def start_health_server(heartbeat: Heartbeat, host: str, port: int) -> ThreadingHTTPServer:
    """GET /healthz answers 200 {"status":"ok"} while the loop is alive, 503 {"status":"degraded"} otherwise."""

    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server API
            if self.path != "/healthz":
                self.send_error(404)
                return
            ok = heartbeat.alive()
            body = json.dumps({"status": "ok" if ok else "degraded"}).encode()
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - silence access logs
            return

    server = ThreadingHTTPServer((host, port), HealthHandler)
    threading.Thread(target=server.serve_forever, name="health", daemon=True).start()
    return server


Connect = Callable[[], AbstractContextManager[Any]]


def make_anon_handler(connect: Connect, ner: Any = None) -> Handler:
    """anon.run in its own transaction: spans, review rows and the record flag commit together or not at all
    (psycopg connection context: commit on success, rollback on exception)."""
    from anonymizer.job import make_anon_run_handler
    from anonymizer.store import SqlAnonStore

    def handle(job: ClaimedJob) -> Dict[str, Any]:
        with connect() as conn:
            with conn.cursor() as cur:
                return make_anon_run_handler(lambda: SqlAnonStore(cur), ner)(job)

    return handle


def build_handlers(rt: Any, connect: Connect, ner: Any = None) -> Dict[JobType, Handler]:
    """Every job type this service consumes. Owners: core.runtime (veri-toplama), anonymizer (anonimlestirme)."""
    from .runtime import make_handlers

    handlers: Dict[JobType, Handler] = dict(make_handlers(rt))
    handlers[JobType.ANON_RUN] = make_anon_handler(connect, ner)
    from nlp.job import make_embed_handler  # casuist: embed.chunks (ADR-0026)
    handlers[JobType.EMBED_CHUNKS] = make_embed_handler(connect)
    return handlers


_CHANNEL = re.compile(r"^[a-z0-9_]+$")


class WorkerLoop:
    """Drains every registered type, then waits for a notification or the poll interval."""

    def __init__(self, consumer: JobConsumer, conn: Any, wait: Callable[[float], None], stop: threading.Event,
                 heartbeat: Heartbeat, poll_seconds: float = 5.0, stale_seconds: int = 900, batch: int = 5,
                 log: Log = json_log):
        self.consumer = consumer
        self.conn = conn
        self.wait = wait
        self.stop = stop
        self.heartbeat = heartbeat
        self.poll_seconds = poll_seconds
        self.stale_seconds = stale_seconds
        self.batch = batch
        self.log = log

    def round(self) -> int:
        ran = 0
        with self.conn.cursor() as cur:
            cur.execute(RELEASE_STALE_JOBS_SQL, {"seconds": self.stale_seconds})
        for job_type in list(self.consumer.handlers):
            while not self.stop.is_set():
                with self.conn.cursor() as cur:
                    n = self.consumer.run_once(cur, job_type, self.batch)
                ran += n
                if n == 0:
                    break
        return ran

    def run(self) -> None:
        self.log("started", types=[t.value for t in self.consumer.handlers])
        while not self.stop.is_set():
            self.heartbeat.beat()
            try:
                self.round()
            except Exception as exc:  # noqa: BLE001 - database down or similar; class name only
                self.log("round failed", error=type(exc).__name__)
            if self.stop.is_set():
                break
            self.wait(self.poll_seconds)
        self.log("stopped")


def main(env: Optional[Mapping[str, str]] = None) -> int:
    import psycopg

    env = env if env is not None else os.environ
    url = env.get("DATABASE_URL")
    if not url:
        json_log("DATABASE_URL is not set")
        return 1
    poll = float(env.get("KAZUIST_POLL_SECONDS") or "5")
    stop = threading.Event()

    def on_signal(signum: int, _frame: Any) -> None:
        json_log("stopping", signal=signal.Signals(signum).name)
        stop.set()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    from anonymizer.ner import backend_from_env

    from .runtime import build_runtime

    try:
        rt = build_runtime(env)
        handlers = build_handlers(rt, lambda: psycopg.connect(url), backend_from_env())
    except Exception as exc:  # noqa: BLE001 - misconfiguration (for example a NER model missing on disk)
        json_log("startup failed", error=type(exc).__name__)
        return 1
    consumer = JobConsumer(f"worker-py-{os.getpid()}", handlers)
    heartbeat = Heartbeat(max_age=max(60.0, poll * 6))
    health = start_health_server(heartbeat, env.get("KAZUIST_HEALTH_HOST", "127.0.0.1"),
                                 int(env.get("KAZUIST_HEALTH_PORT", "8000")))
    internal_port = env.get("KAZUIST_INTERNAL_PORT")
    if internal_port:
        import uvicorn

        from .api import create_app

        config = uvicorn.Config(create_app(rt), host=env.get("KAZUIST_INTERNAL_HOST", "127.0.0.1"),
                                port=int(internal_port), log_level="warning")
        threading.Thread(target=uvicorn.Server(config).run, name="internal-api", daemon=True).start()

    # Collection scheduler: off unless KAZUIST_SCHEDULER=on; honours the source switches and approval (core/scheduler.py).
    from .scheduler import start_scheduler_thread

    start_scheduler_thread(env, rt.registry, lambda: psycopg.connect(url), stop, json_log)

    try:
        with psycopg.connect(url, autocommit=True) as jobs_conn, psycopg.connect(url, autocommit=True) as listen:
            for channel in consumer.channels():
                if not _CHANNEL.match(channel):
                    raise ValueError("invalid channel name")
                listen.execute(f"LISTEN {channel}")

            def wait(seconds: float) -> None:
                for _ in listen.notifies(timeout=seconds, stop_after=1):
                    pass

            WorkerLoop(consumer, jobs_conn, wait, stop, heartbeat, poll_seconds=poll).run()
    except Exception as exc:  # noqa: BLE001 - startup failure: exit non-zero so the platform restarts us
        json_log("worker failed", error=type(exc).__name__)
        return 1
    finally:
        health.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
