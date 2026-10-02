#!/usr/bin/env bash
# Installs this OMP policy into ~/.omp/agent without touching authentication, databases or sessions.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
dest=${PI_CODING_AGENT_DIR:-"$HOME/.omp/agent"}
backup_base="$dest/portable-backups"
. "$root/files.sh"
if [[ ${1:-} == --dry-run ]]; then
  printf 'Source: %s\nDestination: %s\nBackup root: %s (new unique directory per install)\nFiles: %s\n' "$root" "$dest" "$backup_base" "${OMP_FILES[*]}"
  exit 0
fi
if [[ $# -ne 0 ]]; then printf 'Usage: %s [--dry-run]\n' "$0" >&2; exit 2; fi
mkdir -p "$backup_base"
backup=$(mktemp -d "$backup_base/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
for relative in "${OMP_FILES[@]}"; do
  mkdir -p "$(dirname -- "$dest/$relative")" "$(dirname -- "$backup/$relative")"
  if [[ -e "$dest/$relative" ]]; then cp -p -- "$dest/$relative" "$backup/$relative"; fi
  cp -- "$root/$relative" "$dest/$relative"
done
printf 'Installed OMP policy. Backup: %s\n' "$backup"
printf 'Verify local authentication and approval mode: omp usage; omp config get tools.approvalMode\n'
