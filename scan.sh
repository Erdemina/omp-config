#!/usr/bin/env bash
# Fails if a tracked or staged-to-be file contains something that looks like a secret.
# Prints file:line only, never the matched value.
set -euo pipefail
root=$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)
pattern='(ghp_|gho_|github_pat_|glpat-|sk-[A-Za-z0-9_-]{16,}|sk-ant-|xox[abp]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|Bearer [A-Za-z0-9._-]{20,}|(api[_-]?key|secret|password|passwd|token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_.-]{12,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})'
files=$(cd "$root" && git ls-files --cached --others --exclude-standard -- . ':!scan.sh')
hits=$(cd "$root" && printf '%s\n' "$files" | xargs -d '\n' grep -nIiE "$pattern" -- | cut -d: -f1,2 || true)
if [[ -n $hits ]]; then
  printf 'Possible secret or e-mail address (file:line):\n%s\n' "$hits" >&2
  exit 1
fi
printf 'scan: clean\n'
