# omp-config

My portable configuration for [OMP](https://github.com/can1357/oh-my-pi) (oh-my-pi coding agent): model routing, delegation policy, two specialist agents and a small `/auto` extension. Tested with OMP 18.3.x on Linux.

No credentials, sessions or databases are stored here. Authentication stays in each machine's `~/.omp/agent`.

## Files

| File | Purpose |
| --- | --- |
| `config.yml` | Model roles, cross-provider fallback chains (`openai-codex` ↔ `anthropic`), task concurrency, compaction thresholds. |
| `AGENTS.md` | Global policy loaded into every session: quota rules, delegation limits, durable memory, skills. |
| `agents/opus.md`, `agents/gpt6.md` | Specialist subagents (Claude Opus / GPT-6 Sol, high effort), each falling back to the other. |
| `extensions/orchestrator.ts` | `/auto` selects the `orchestrator` role and persists it as default; `/auto status` shows AUTO/MANUAL in the status line. |
| `codex-lane.yml` | Optional overlay for an isolated Codex-only unattended run (`omp -p --config ./codex-lane.yml …`); disables cross-provider fallback for that run only. |
| `quota.py` | Classifies `omp usage --json` per provider; stale (>15 min), missing or ambiguous measurements are reported as `unknown`, never as available. |
| `install.sh` / `capture.sh` / `scan.sh` / `files.sh` | Install into, capture from, and secret-scan; `files.sh` lists the mirrored files. |

## Install

1. Install OMP and authenticate the providers you use (`openai-codex`, `anthropic`). Check that the configured model ids exist: `omp models openai-codex`, `omp models anthropic`.
2. `./install.sh --dry-run`, then `./install.sh`. Only the files in `files.sh` are replaced under `${PI_CODING_AGENT_DIR:-~/.omp/agent}`; each replaced file is backed up to `portable-backups/<timestamp>/`.
3. Check `omp config get tools.approvalMode`, `omp config get enabledProviders`, `omp usage` and `/auto status`. The install does not change the approval mode.

If you only have one provider, remove the other from `enabledProviders` and from the fallback chains.

`AGENTS.md` refers to a private memory repository (`~/erdem-memory`) and a personal skills folder; on machines without them those sections are skipped.

## Updating

After changing settings in OMP, run `./capture.sh`: it copies the live files back here and runs `scan.sh`, which fails on anything that looks like a token, key, password or e-mail address. A local pre-commit hook runs the same scan (`ln -s ../../scan.sh .git/hooks/pre-commit`).

## Known limitation

Cross-provider fallback is a model reroute, not a transaction. A print-mode `@plan` run once ended on an Anthropic HTTP 429 without switching to GPT. Edits made before a failure are not rolled back: inspect the working tree and restart explicitly on the available provider with a short checkpoint (objective, changed files, checks, next steps).

## Rollback

Copy the files from the backup directory printed by `install.sh` back into `~/.omp/agent` and restart OMP.
