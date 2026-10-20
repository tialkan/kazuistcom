"""Worker entry point: python -m core.worker. Polls the job types it has handlers for (jobs.py contract) and
serves the internal API on a private interface when KAZUIST_INTERNAL_PORT is set."""

from __future__ import annotations

import os
import threading
import time

from .jobs import JobConsumer
from .runtime import build_runtime, make_handlers


def main() -> None:
    import psycopg

    rt = build_runtime()
    consumer = JobConsumer(f"worker-py-{os.getpid()}", make_handlers(rt))
    port = os.environ.get("KAZUIST_INTERNAL_PORT")
    if port:
        import uvicorn

        from .api import create_app

        config = uvicorn.Config(create_app(rt), host=os.environ.get("KAZUIST_INTERNAL_HOST", "127.0.0.1"), port=int(port))
        threading.Thread(target=uvicorn.Server(config).run, daemon=True).start()
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        while True:
            worked = 0
            for job_type in consumer.handlers:
                with conn.cursor() as cur:
                    worked += consumer.run_once(cur, job_type)
            if not worked:
                time.sleep(5)


if __name__ == "__main__":
    main()
