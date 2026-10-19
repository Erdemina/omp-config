#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
. "$root/files.sh"
OMP_PROG=capture
[[ $# == 0 || ( $# == 1 && $1 == --dry-run ) ]] || omp_die 'Usage: capture.sh [--dry-run]'
src=${PI_CODING_AGENT_DIR:-"$HOME/.omp/agent"}
omp_validate_manifest
for rel in "${OMP_FILES[@]}"; do
  omp_check_path "$src" "$rel" 1 source
  omp_check_path "$root" "$rel" 0 destination
done
[[ ${1:-} != --dry-run ]] || { printf 'Capture: %s\n' "${OMP_FILES[@]}"; exit 0; }
stage=$(mktemp -d)
trap 'omp_cleanup_tmp; rm -rf -- "$stage"' EXIT
staged=()
for rel in "${OMP_FILES[@]}"; do
  mkdir -p -- "$stage/$(dirname -- "$rel")"
  cp -- "$src/$rel" "$stage/$rel"
  staged+=("$stage/$rel")
done
bash "$root/scan.sh" "${staged[@]}"
backup=$(mktemp -d "$root/.capture-backup.XXXXXXXX")
for rel in "${OMP_FILES[@]}"; do
  mkdir -p -- "$backup/$(dirname -- "$rel")"
  [[ ! -f $root/$rel ]] || cp -p -- "$root/$rel" "$backup/$rel"
  omp_atomic_copy "$stage/$rel" "$root/$rel" "$(omp_target_mode "$src/$rel" "$root/$rel")"
done
printf 'Captured policy. Previous files: %s\n' "$backup"
