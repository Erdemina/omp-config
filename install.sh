#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
. "$root/files.sh"
OMP_PROG=install
[[ $# == 0 || ( $# == 1 && $1 == --dry-run ) ]] || omp_die 'Usage: install.sh [--dry-run]'
dry=${1:-}
dest=${PI_CODING_AGENT_DIR:-"$HOME/.omp/agent"}
omp_check_dir "$dest" destination
omp_validate_manifest
for rel in "${OMP_FILES[@]}"; do omp_check_path "$root" "$rel" 1 source; done
changes=()
for rel in "${OMP_FILES[@]}" "${OMP_RETIRED_FILES[@]}"; do
  omp_check_path "$dest" "$rel" 0 destination
  if [[ -f $root/$rel ]]; then
    if [[ ! -f $dest/$rel ]] || ! cmp -s -- "$root/$rel" "$dest/$rel"; then changes+=("$rel"); fi
  elif [[ -f $dest/$rel ]]; then changes+=("$rel"); fi
done
if (( ${#changes[@]} == 0 )); then printf 'Already installed.\n'; exit 0; fi
printf 'Destination: %s\n' "$dest"
printf 'Change: %s\n' "${changes[@]}"
[[ $dry != --dry-run ]] || exit 0
omp_check_dir "$dest/portable-backups" backups
mkdir -p -- "$dest/portable-backups"
omp_lock "$dest/portable-backups"
trap 'omp_cleanup_tmp; omp_unlock' EXIT
for rel in "${OMP_FILES[@]}"; do omp_check_path "$root" "$rel" 1 source; done
for rel in "${changes[@]}"; do omp_check_path "$dest" "$rel" 0 destination; done
backup=$(mktemp -d "$dest/portable-backups/install.XXXXXXXX")
chmod 700 "$backup"
for rel in "${changes[@]}"; do
  mkdir -p -- "$backup/files/$(dirname -- "$rel")"
  if [[ -f $dest/$rel ]]; then cp -p -- "$dest/$rel" "$backup/files/$rel"; fi
  printf '%s\n' "$rel" >>"$backup/manifest"
done
for rel in "${changes[@]}"; do
  if [[ -f $root/$rel ]]; then
    omp_atomic_copy "$root/$rel" "$dest/$rel" "$(omp_target_mode "$root/$rel" "$dest/$rel")"
  else rm -- "$dest/$rel"; fi
done
printf 'Backup: %s\nRollback: bash %s/rollback.sh %q\n' "$backup" "$root" "$backup"
