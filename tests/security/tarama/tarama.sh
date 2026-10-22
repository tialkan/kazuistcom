#!/bin/sh
# Secrets, dependency and license scans for the wave gate (plan 5.6/7, 15.1, 15.3/7).
# Usage from the repository root: sh tests/security/tarama/tarama.sh <output dir>
# Needs: gitleaks 8.30.x on PATH, pnpm, uv (services/worker-py/.venv after `uv sync`).
# Output files hold findings only; gitleaks runs with --redact so no secret value is written.
set -u
OUT=${1:?output directory}
mkdir -p "$OUT"
status=0

echo "== gitleaks (full history, redacted)"
gitleaks git --redact --no-banner --report-format json --report-path "$OUT/gitleaks.json" . > "$OUT/gitleaks.txt" 2>&1
g=$?
tail -2 "$OUT/gitleaks.txt"
[ $g -eq 0 ] || status=1
# Uncommitted test sources (gitleaks dir does not honour .gitignore, so node_modules and test-results are skipped).
for d in tests/e2e/specs tests/security/http tests/security/enjeksiyon tests/security/tarama; do
  [ -d "$d" ] || continue
  gitleaks dir --redact --no-banner "$d" > "$OUT/gitleaks-dir.txt" 2>&1 || { status=1; echo "leak in $d"; }
done

echo "== pnpm audit (workspace, all dependencies)"
pnpm audit --json > "$OUT/pnpm-audit.json" 2> "$OUT/pnpm-audit.err"
pnpm audit > "$OUT/pnpm-audit.txt" 2>&1
a=$?
tail -3 "$OUT/pnpm-audit.txt"
pnpm audit --audit-level high > /dev/null 2>&1 || status=1
echo "pnpm audit exit $a"

for d in tests/e2e tests/security; do
  if [ -d "$d/node_modules" ]; then
    echo "== pnpm audit ($d)"
    pnpm --dir "$d" audit --ignore-workspace 2>&1 | tail -2
  fi
done

echo "== Python dependency audit (pip-audit through uvx, services/worker-py lock)"
( cd services/worker-py && uv export --frozen --no-hashes --all-extras > "$OUT/requirements.txt" 2> /dev/null )
uvx --from pip-audit pip-audit -r "$OUT/requirements.txt" --progress-spinner off > "$OUT/pip-audit.txt" 2>&1
p=$?
tail -5 "$OUT/pip-audit.txt"
echo "pip-audit exit $p"

echo "== licenses (AGPL and SSPL forbidden without ADR)"
pnpm licenses list --json > "$OUT/pnpm-lisans.json" 2> /dev/null
python3 -I tests/security/tarama/lisans.py node "$OUT/pnpm-lisans.json" > "$OUT/lisans-node.txt" || status=1
grep -E "packages|FORBIDDEN|review" "$OUT/lisans-node.txt"
for d in tests/e2e tests/security; do
  if [ -d "$d/node_modules" ]; then
    pnpm --dir "$d" licenses list --json --ignore-workspace > "$OUT/lisans-$(basename $d).json" 2> /dev/null
    python3 -I tests/security/tarama/lisans.py node "$OUT/lisans-$(basename $d).json" | grep -E "packages|FORBIDDEN|review"
  fi
done
services/worker-py/.venv/bin/python -I tests/security/tarama/lisans.py python > "$OUT/lisans-python.txt" || status=1
grep -E "packages|FORBIDDEN|review" "$OUT/lisans-python.txt"

echo "tarama status $status"
exit $status
