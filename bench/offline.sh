#!/usr/bin/env bash
# Offline per-request overhead: old vs new configuration, same model, fake endpoint.
# Measures what one request carries before any task work (system prompt size, tool
# schemas, requested effort) and how many requests a trivial prompt costs.
# No paid calls. Usage: OMP_BIN="omp" bench/offline.sh [old-git-ref]
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
ref=${1:-2204e7a}
read -r -a omp <<<"${OMP_BIN:-omp}"
work=$(mktemp -d)
cleanup() { [[ -n ${mock:-} ]] && kill "$mock" 2>/dev/null; rm -rf "$work"; }
trap cleanup EXIT
export HOME=$work/home
mkdir -p "$HOME/project"
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 "$root/tests/mock_anthropic.py" "$port" "$work/requests.jsonl" & mock=$!
export ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://127.0.0.1:$port
unset OPENAI_API_KEY OPENROUTER_API_KEY || true
sleep 0.5

# Old configuration: its own installer from the old commit.
mkdir -p "$work/old-src"
git -C "$root" archive "$ref" | tar -x -C "$work/old-src"
PI_CODING_AGENT_DIR=$work/old "$work/old-src/install.sh" >/dev/null
PI_CODING_AGENT_DIR=$work/new bun "$root/install.ts" --profile claude >/dev/null

measure() { # label agent-dir model
  local start
  start=$( [[ -f $work/requests.jsonl ]] && wc -l <"$work/requests.jsonl" || echo 0)
  (cd "$HOME/project" && PI_CODING_AGENT_DIR=$2 timeout 120 "${omp[@]}" -p --no-session --model "$3" "say ok" </dev/null >/dev/null 2>&1) || true
  python3 - "$work/requests.jsonl" "$start" "$1" "$3" <<'PY'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])][int(sys.argv[2]):]
for r in rows:
    effort = (r.get("output_config") or {}).get("effort")
    print(f"{sys.argv[3]:<4} {sys.argv[4]:<28} requests={len(rows)} system_chars={r['system_chars']} tools={len(r['tools'])} effort={effort}")
PY
}
for model in anthropic/claude-sonnet-5-5 anthropic/claude-opus-5-5; do
  measure old "$work/old" "$model"
  measure new "$work/new" "$model"
done
