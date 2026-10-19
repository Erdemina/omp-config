#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
. "$root/files.sh"
OMP_PROG=rollback
[[ $# == 1 || ( $# == 2 && $2 == --dry-run ) ]] || omp_die 'Usage: rollback.sh BACKUP [--dry-run]'
backup=$1
dest=${PI_CODING_AGENT_DIR:-"$HOME/.omp/agent"}
omp_validate_manifest
omp_check_dir "$dest" destination
omp_check_dir "$dest/portable-backups" backups
[[ $backup == "$dest/portable-backups/"* ]] || omp_die 'backup must be inside destination portable-backups'
[[ ${backup#"$dest/portable-backups/"} =~ ^(install|rollback)\.[A-Za-z0-9]{8}$ ]] || omp_die 'invalid backup directory name'
omp_check_dir "$backup" backup
omp_check_path "$backup" manifest 1 backup
declare -A seen=()
changes=()
while IFS= read -r rel; do
  omp_safe_relpath "$rel" || omp_die 'unsafe backup manifest'
  [[ ! -v seen["$rel"] ]] || omp_die 'duplicate backup manifest entry'
  seen["$rel"]=1
  found=false
  for allowed in "${OMP_FILES[@]}" "${OMP_RETIRED_FILES[@]}"; do [[ $allowed != "$rel" ]] || found=true; done
  $found || omp_die 'backup contains unmanaged path'
  omp_check_path "$backup" "files/$rel" 0 backup
  omp_check_path "$dest" "$rel" 0 destination
  changes+=("$rel")
done <"$backup/manifest"
printf 'Restore: %s\n' "${changes[@]}"
[[ ${2:-} != --dry-run ]] || exit 0
omp_check_dir "$dest/portable-backups" backups
omp_lock "$dest/portable-backups"
for rel in "${changes[@]}"; do
  omp_check_path "$backup" "files/$rel" 0 backup
  omp_check_path "$dest" "$rel" 0 destination
done
trap 'omp_cleanup_tmp; omp_unlock' EXIT
# Preserve current policy before restoring an older one.
safety=$(mktemp -d "$dest/portable-backups/rollback.XXXXXXXX")
chmod 700 "$safety"
for rel in "${changes[@]}"; do
  mkdir -p -- "$safety/files/$(dirname -- "$rel")"
  [[ ! -f $dest/$rel ]] || cp -p -- "$dest/$rel" "$safety/files/$rel"
  printf '%s\n' "$rel" >>"$safety/manifest"
done
for rel in "${changes[@]}"; do
  if [[ -f $backup/files/$rel ]]; then
    omp_atomic_copy "$backup/files/$rel" "$dest/$rel" "$(omp_mode_of "$backup/files/$rel")"
  elif [[ -f $dest/$rel ]]; then rm -- "$dest/$rel"; fi
done
printf 'Restored. Previous policy preserved: %s\n' "$safety"
