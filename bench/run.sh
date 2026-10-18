#!/usr/bin/env bash
# Runs the benchmark tasks against the omp configuration that is installed now
# and appends one JSON result per task to the results file.
#
#   bench/run.sh --label NAME [--run] [--tasks id,id] [--model provider/id] [--out FILE]
#
# Without --run it only prints the plan. With --run every task is a real omp
# session and spends model quota (unless ANTHROPIC_BASE_URL points at a mock).
# Success = the task's hidden check plus the fixture tests it must keep green.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
read -r -a omp <<<"${OMP_BIN:-omp}"
label='' run=0 only='' model=() out=$root/results.jsonl
while [[ $# -gt 0 ]]; do
  case $1 in
    --label) label=$2; shift 2 ;;
    --run) run=1; shift ;;
    --tasks) only=$2; shift 2 ;;
    --model) model=(--model "$2"); shift 2 ;;
    --out) out=$2; shift 2 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
[[ -n $label ]] || { printf 'usage: %s --label NAME [--run] [--tasks id,id] [--model M] [--out FILE]\n' "$0" >&2; exit 2; }

mapfile -t ids < <(python3 -c 'import json, sys; print("\n".join(t["id"] for t in json.load(open(sys.argv[1]))))' "$root/tasks.json")
[[ -n $only ]] && IFS=, read -r -a ids <<<"$only"
task() { python3 -c 'import json, sys; t = {t["id"]: t for t in json.load(open(sys.argv[1]))}[sys.argv[2]]; v = t[sys.argv[3]]; print(" ".join(v) if isinstance(v, list) else v)' "$root/tasks.json" "$1" "$2"; }

if [[ $run -eq 0 ]]; then
  printf 'Dry run (add --run to execute; each task spends model quota).\nlabel=%s out=%s\n' "$label" "$out"
  for id in "${ids[@]}"; do printf '  %-10s %s\n' "$id" "$(task "$id" prompt)"; done
  exit 0
fi

for id in "${ids[@]}"; do
  work=$(mktemp -d)
  cp -r "$root/fixture" "$work/repo"
  git -C "$work/repo" init -q && git -C "$work/repo" add -A && git -C "$work/repo" -c user.name=bench -c user.email=bench@localhost commit -qm fixture
  start=$(date +%s)
  (cd "$work/repo" && timeout "${TASK_TIMEOUT:-1800}" "${omp[@]}" -p --session-dir "$work/sessions" "${model[@]}" "$(task "$id" prompt)" \
    </dev/null >"$work/agent.log" 2>&1) && agent_rc=0 || agent_rc=$?
  elapsed=$(( $(date +%s) - start ))
  cp "$root/checks/$id.py" "$work/repo/tests/test_zz_check.py"
  # shellcheck disable=SC2046
  (cd "$work/repo" && python3 -m unittest tests.test_zz_check $(task "$id" tests)) >"$work/check.log" 2>&1 && ok=true || ok=false
  stats=$(python3 "$root/../tools/session_stats.py" "$work/sessions" 2>/dev/null || echo '{}')
  python3 - "$label" "$id" "$(task "$id" kind)" "$ok" "$agent_rc" "$elapsed" "${model[1]:-}" "$stats" >>"$out" <<'PY'
import json, sys
label, id_, kind, ok, rc, elapsed, model, stats = sys.argv[1:]
print(json.dumps({"label": label, "task": id_, "kind": kind, "success": ok == "true", "agentExit": int(rc),
                  "seconds": int(elapsed), "model": model or None, **json.loads(stats)}))
PY
  printf '%-10s success=%s seconds=%s\n' "$id" "$ok" "$elapsed"
  rm -rf "$work"
done
