"""Exercise scanner exit propagation with isolated CLI doubles, without network."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parent


class ScannerExitTests(unittest.TestCase):
    def scan(self, failure):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "tests/security/tarama"
            target.mkdir(parents=True)
            shutil.copy(SOURCE / "tarama.sh", target)
            shutil.copy(SOURCE / "lisans.py", target)
            shutil.copy(SOURCE / "audit_json.py", target)
            for name in ("tests/e2e", "tests/security"):
                (root / name / "node_modules").mkdir(parents=True, exist_ok=True)
            python = root / "services/worker-py/.venv/bin/python"
            python.parent.mkdir(parents=True)
            python.write_text(
                '#!/bin/sh\n[ "$FAILURE" != python-license ] || exit 2\necho "python: 1 packages"\n'
            )
            python.chmod(0o755)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            stub = """#!/bin/sh
case "$0:$*" in
 *pnpm*licenses*) [ "$FAILURE" != empty-license ] || { echo "{}"; exit 0; }; [ "$FAILURE" != forbidden-license ] || { echo '{"AGPL-3.0":[{"name":"bad","versions":["1"]}]}'; exit 0; }; [ "$FAILURE" != node-license-cli ] || exit 2; echo '{"MIT":[{"name":"stub","versions":["1"]}]}';;
 *pnpm*--dir*audit*) [ "$FAILURE" != sub-audit ] || exit 2;;
 *pnpm*audit*--json*) [ "$FAILURE" != audit-empty ] || exit 0; echo '{"advisories":{},"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0},"totalDependencies":1}}';;
 *pnpm*audit*) [ "$FAILURE" != root-audit ] || exit 2;;
 *uvx*) [ "$FAILURE" != pip-audit ] || exit 1;;
 *uv*) [ "$FAILURE" != export ] || exit 2; echo 'example==1';;
esac
exit 0
"""
            for name in ("pnpm", "uv", "uvx", "gitleaks"):
                path = bin_dir / name
                path.write_text(stub)
                path.chmod(0o755)
            env = dict(
                os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", FAILURE=failure
            )
            return subprocess.run(
                ["sh", str(target / "tarama.sh"), str(root / "out")],
                cwd=root,
                env=env,
                capture_output=True,
                check=False,
            ).returncode

    def test_success(self):
        self.assertEqual(self.scan("none"), 0)

    def test_failures_close_gate(self):
        for failure in (
            "pip-audit",
            "export",
            "sub-audit",
            "root-audit",
            "node-license-cli",
            "python-license",
            "empty-license",
            "forbidden-license",
            "audit-empty",
        ):
            with self.subTest(failure=failure):
                self.assertNotEqual(self.scan(failure), 0)


if __name__ == "__main__":
    unittest.main()
