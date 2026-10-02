#!/usr/bin/env bash
# Copies the live policy files from ~/.omp/agent into this repository and refuses to
# continue if anything looks like a credential. This repository is public.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
src=${PI_CODING_AGENT_DIR:-"$HOME/.omp/agent"}
. "$root/files.sh"
for relative in "${OMP_FILES[@]}"; do
  mkdir -p "$(dirname -- "$root/$relative")"
  cp -- "$src/$relative" "$root/$relative"
done
"$root/scan.sh"
git -C "$root" status --short
