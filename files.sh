# Manifest and shared helpers (sourced by install.sh, rollback.sh and capture.sh).
# Not executable on its own.

# Files mirrored between this repository and the OMP agent directory.
OMP_FILES=(
  config.yml
  AGENTS.md
  agents/opus.md
  agents/gpt6.md
  extensions/provider-modes.ts
  extensions/lib/modes.ts
  extensions/lib/checkpoint.ts
)

# Files from earlier versions. install.sh removes them from the agent directory
# (after a backup, so rollback.sh restores them). capture.sh never copies them.
OMP_RETIRED_FILES=(
  extensions/orchestrator.ts
  quota.py
  codex-lane.yml
  extensions/lib/usage.ts
)

OMP_LOCK=
OMP_PENDING_TMP=

omp_die() {
  printf '%s: %s\n' "${OMP_PROG:-omp}" "$*" >&2
  exit 1
}


omp_mode_of() { stat -c %a -- "$1" 2>/dev/null || stat -f %Lp -- "$1"; }

# Relative paths must be plain, normalized and must never name authentication,
# database, session or backup data. This is the single guard that keeps the
# installer away from state that is not policy.
omp_safe_relpath() {
  local rel=$1 lower
  [[ $rel =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] || return 1
  [[ /$rel/ != */./* && /$rel/ != */../* ]] || return 1
  lower=$(printf '%s' "$rel" | LC_ALL=C tr '[:upper:]' '[:lower:]')
  if [[ $lower =~ (^|/)(auth[^/]*|agent\.db[^/]*|[^/]*\.(db|sqlite3?)([-.][a-z]+)?|sessions?|credentials?[^/]*|\.env[^/]*|portable-backups|[^/]*\.lock)(/|$) ]]; then
    return 1
  fi
  return 0
}

omp_validate_manifest() {
  local rel other
  for rel in "${OMP_FILES[@]}" "${OMP_RETIRED_FILES[@]}"; do
    omp_safe_relpath "$rel" || omp_die "unsafe manifest entry: $rel"
  done
  for rel in "${OMP_RETIRED_FILES[@]}"; do
    for other in "${OMP_FILES[@]}"; do
      [[ $rel != "$other" ]] || omp_die "manifest entry is both installed and retired: $rel"
    done
  done
}

# omp_check_path BASE REL REQUIRED LABEL
# Walks BASE/REL component by component. A symbolic link anywhere below BASE is
# refused (it could redirect a write to authentication or session data);
# directories must be directories, the final entry must be a regular file.
# Missing components are fine unless REQUIRED=1.
omp_check_path() {
  local base=$1 rel=$2 required=$3 label=$4 cur=$1 i last
  local -a parts
  IFS=/ read -r -a parts <<<"$rel"
  last=$(( ${#parts[@]} - 1 ))
  for i in "${!parts[@]}"; do
    cur=$cur/${parts[i]}
    if [[ -L $cur ]]; then
      omp_die "$label: symbolic link is not allowed: $rel"
    fi
    if [[ ! -e $cur ]]; then
      if (( required )); then omp_die "$label: missing file: $rel"; fi
      return 0
    fi
    if (( i < last )); then
      [[ -d $cur ]] || omp_die "$label: not a directory in path: $rel"
    else
      [[ -f $cur ]] || omp_die "$label: not a regular file: $rel"
    fi
  done
}

# omp_check_dir DIR LABEL: when DIR exists it must be a real directory, not a link.
omp_check_dir() {
  if [[ -L $1 ]]; then omp_die "$2: symbolic link is not allowed: $1"; fi
  if [[ -e $1 && ! -d $1 ]]; then omp_die "$2: not a directory: $1"; fi
  return 0
}


# omp_target_mode SRC DEST: mode for the replacement file. An existing file keeps
# its mode; a new file gets 644. A source with the owner execute bit makes the
# target executable.
omp_target_mode() {
  local src=$1 dest=$2 m
  if [[ -e $dest ]]; then
    m=$(( 8#$(omp_mode_of "$dest") ))
  else
    m=$(( 8#644 ))
  fi
  if [[ -x $src ]]; then
    m=$(( m | 8#100 | ((m & 8#040) >> 2) | ((m & 8#004) >> 2) ))
  fi
  printf '%o\n' "$m"
}


# omp_atomic_copy SRC DEST MODE: write a temporary file in DEST's directory, then
# rename it over DEST. Readers see the old or the new file, never a partial one.
omp_atomic_copy() {
  local src=$1 target=$2 mode=$3 dir tmp
  dir=$(dirname -- "$target")
  mkdir -p -- "$dir"
  tmp=$(mktemp "$dir/.${target##*/}.portable.XXXXXX")
  OMP_PENDING_TMP=$tmp
  cp -- "$src" "$tmp"
  chmod "$mode" "$tmp"
  mv -f -- "$tmp" "$target"
  OMP_PENDING_TMP=
}

omp_cleanup_tmp() {
  if [[ -n $OMP_PENDING_TMP ]]; then rm -f -- "$OMP_PENDING_TMP"; OMP_PENDING_TMP=; fi
  return 0
}

# Single-writer lock shared by install.sh and rollback.sh (a directory, so the
# creation is atomic and needs no external tool).
omp_lock() {
  local dir=$1/.lock
  mkdir -- "$dir" 2>/dev/null ||
    omp_die "another install or rollback is running; if none is, remove the stale lock: $dir"
  OMP_LOCK=$dir
}

omp_unlock() {
  if [[ -n $OMP_LOCK ]]; then rmdir -- "$OMP_LOCK" 2>/dev/null || true; OMP_LOCK=; fi
  return 0
}
