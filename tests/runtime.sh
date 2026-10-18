#!/usr/bin/env bash
# Offline runtime checks with the real omp binary, a throwaway HOME and a fake
# Anthropic endpoint (tests/mock_anthropic.py). No paid model calls; Codex is
# never authenticated, so any Codex attempt fails locally.
#   OMP_BIN="omp" tests/runtime.sh     (OMP_BIN may be a command line, e.g. "bun /path/cli.js")
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
read -r -a omp <<<"${OMP_BIN:-omp}"
work=$(mktemp -d)
cleanup() { [[ -n ${mock:-} ]] && kill "$mock" 2>/dev/null; [[ -n ${KEEP_WORK:-} ]] || rm -rf "$work"; }
trap cleanup EXIT

export HOME=$work/home PI_CODING_AGENT_DIR=$work/home/.omp/agent
mkdir -p "$HOME/project" && cd "$HOME/project" && printf 'mock project\n' >README.md
# A fake Anthropic key and a fake OpenRouter key: the profiles must never fall
# back to "some other logged-in provider". Codex is never logged in.
unset OPENAI_API_KEY CODEX_HOME ANTHROPIC_OAUTH_TOKEN || true
export OPENROUTER_API_KEY=mock
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
log=$work/requests.jsonl
python3 "$root/tests/mock_anthropic.py" "$port" "$log" & mock=$!
export ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://127.0.0.1:$port
for _ in $(seq 50); do python3 -c "import socket; socket.create_connection(('127.0.0.1', $port))" 2>/dev/null && break; sleep 0.1; done

pass=0 fail=0
check() { # name, condition...
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); printf 'ok   %s\n' "$name"; else fail=$((fail + 1)); printf 'FAIL %s\n' "$name"; fi
}
requests() { [[ -f $log ]] && wc -l <"$log" || echo 0; }
# Distinct values of a Python expression over request rows from index $1 on (r = one row).
field() { python3 -c 'import json, sys; rows = [json.loads(l) for l in open(sys.argv[1])][int(sys.argv[2]):]; print(" ".join(sorted({str(eval(sys.argv[3], {}, {"r": r})) for r in rows})))' "$log" "$1" "$2"; }
run() { timeout "${RUN_TIMEOUT:-120}" "${omp[@]}" -p --no-session "$@" </dev/null >"$work/out" 2>&1; }

bun "$root/install.ts" --profile claude >/dev/null

# 1. Claude profile: default role and its effort suffix reach the provider.
before=$(requests)
run "say ok" || true
check "claude: prompt answered" grep -q OK "$work/out"
check "claude: exactly one model request" test "$(( $(requests) - before ))" -eq 1
check "claude: default model is claude-sonnet-5-5" test "$(field "$before" 'r["model"]')" = claude-sonnet-5-5
check "claude: BALANCED effort is medium" test "$(field "$before" 'r["output_config"]["effort"]')" = medium

# 2. Explicit model and effort override inside the provider still work.
before=$(requests)
run --model anthropic/claude-opus-5-5 --thinking high "say ok" || true
check "claude: explicit --model/--thinking honored" test "$(field "$before" 'r["model"] + "/" + r["output_config"]["effort"]')" = claude-opus-5-5/high

# 3. A Codex model is refused, not silently replaced by a Claude model.
before=$(requests)
if run --model openai-codex/gpt-6-sol "say ok"; then rc=0; else rc=$?; fi
check "claude: Codex model rejected (exit $rc)" test "$rc" -ne 0
check "claude: no request sent instead" test "$(requests)" -eq "$before"

# 4. Session accounting from a recorded session with one tool call.
sessions=$work/sessions
timeout "${RUN_TIMEOUT:-120}" "${omp[@]}" -p --session-dir "$sessions" "MOCK_TOOL read the readme" </dev/null >"$work/out" 2>&1 || true
stats=$(python3 "$root/tools/session_stats.py" "$sessions")
check "stats: 2 model calls, 1 read tool call, no fallback" python3 -c "
import json, sys; s = json.loads(sys.argv[1])
assert s['modelCalls'] == 2 and s['toolCallsByName'] == {'read': 1} and s['fallbackModelChanges'] == 0, s
assert s['tokens']['input'] == 2400 and s['tokens']['cacheRead'] == 1600, s" "$stats"

# 5. Codex profile with only an Anthropic credential: fails, never uses Claude.
bun "$root/install.ts" --profile codex >/dev/null
before=$(requests)
if run "say ok"; then rc=0; else rc=$?; fi
check "codex: unauthenticated Codex fails (exit $rc)" test "$rc" -ne 0
check "codex: no Anthropic request" test "$(requests)" -eq "$before"
check "codex: no other provider chosen" grep -q 'No model available matching enabledModels' "$work/out"

# 6. Per-run overlay over the Claude install switches provider completely.
bun "$root/install.ts" --profile claude >/dev/null
before=$(requests)
if run --config "$PI_CODING_AGENT_DIR/profiles/codex.yml" "say ok"; then rc=0; else rc=$?; fi
check "overlay: codex overlay fails without Codex login (exit $rc)" test "$rc" -ne 0
check "overlay: no Anthropic request" test "$(requests)" -eq "$before"
check "overlay: no other provider chosen" grep -q 'No model available matching enabledModels' "$work/out"

# 7. Claude profile without a Claude login: stops instead of using OpenRouter/Bedrock.
if ANTHROPIC_API_KEY= run "say ok"; then rc=0; else rc=$?; fi
check "claude: no login fails (exit $rc)" test "$rc" -ne 0
check "claude: no other provider chosen" grep -q 'No model available matching enabledModels' "$work/out"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
