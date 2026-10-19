#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
python3 "$root/scan.py" "$@"
