#!/usr/bin/env bash
# All checks: static + install + benchmark self-check, offline runtime, secret scan.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
bun test
tests/runtime.sh
./scan.sh
