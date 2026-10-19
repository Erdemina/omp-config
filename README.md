# omp-config

Portable OMP policy: automatic provider-matched helper roles and resumable task checkpoints.

The repository contains no credentials, sessions, or databases. Authentication remains in each machine's `~/.omp/agent`.

## Contents

| File | Purpose |
| --- | --- |
| `config.yml` | Model roles, disabled automatic provider fallback, task concurrency, compaction. |
| `AGENTS.md` | Global delegation, quota, memory, and output policy. |
| `agents/opus.md`, `agents/gpt6.md` | Specialist subagents. |
| `extensions/provider-modes.ts`, `extensions/lib/` | Automatic helper routing and `task_checkpoint`; no custom slash commands. |
| `files.sh`, `install.sh`, `rollback.sh`, `capture.sh`, `scan.sh` | Mirrored-file manifest and safe deployment tools. |

## Install and rollback

Install OMP and authenticate only the providers you intend to use. Run `bash install.sh --dry-run`, then `bash install.sh`. The installer changes only manifest files under `${PI_CODING_AGENT_DIR:-~/.omp/agent}` and saves prior versions in `portable-backups/install.*`. It retires the older `/auto`, `quota.py`, and `codex-lane.yml` files after backing them up. It does not change the approval mode or authentication data.

To restore a backup printed by the installer, run `bash rollback.sh BACKUP --dry-run`, then `bash rollback.sh BACKUP`. Rollback saves the current files in another backup first. Both operations reject symlinked managed paths. A lock prevents simultaneous installs and rollbacks.

After changing policy in OMP, run `bash capture.sh --dry-run`, then `bash capture.sh`. Capture scans staged content for secrets before copying it into the repository. Run `bash scan.sh` before publishing. Optional local pre-commit hook: `ln -s ../../scan.sh .git/hooks/pre-commit`.

`AGENTS.md` refers to private `~/erdem-memory` and personal skills; absent directories are skipped.

## Model modes and quota

Choose the main model with native `/model` or the CLI. At session startup/restoration and before each user turn, helper roles follow its provider: `openai-codex` uses Codex roles; `anthropic` uses Claude roles. The extension never replaces the main model. Explicit subagent model selectors remain unchanged. Historical provider-mode entries are ignored. The custom `/claude`, `/codex`, `/mixed`, `/quota`, and `/checkpoint` commands have been removed. Restart OMP after installing the extension changes.

`/usage` remains OMP's native command. Before large unattended parallel work, check `omp usage` directly. Missing or stale quota data is unknown, not permission to switch providers.

The fallback settings disable automatic changes after API errors or quota checks. A provider error does not prove quota exhaustion. No command retries an interrupted turn on another provider; tool effects are not rolled back.

`task_checkpoint` saves concise state in the local OMP directory keyed by project and session. Its result and session entry contain the saved file path. Save before compaction or a risky transition; resume in the same native session and read that file when needed. Verify effects rather than replaying them. Do not put secrets in checkpoint fields.
