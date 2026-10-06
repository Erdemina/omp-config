# omp-config

My portable configuration for [OMP](https://github.com/can1357/oh-my-pi) (oh-my-pi coding agent): model routing, delegation policy, two specialist agents and a small `/auto` extension. Model-lock behavior verified with OMP 18.6.1 on Linux.

No credentials, sessions or databases are stored here. Authentication stays in each machine's `~/.omp/agent`.

## Files

| File | Purpose |
| --- | --- |
| `config.yml` | Model roles, automatic model switching disabled, task concurrency, compaction thresholds. |
| `AGENTS.md` | Global policy loaded into every session: quota rules, delegation limits, durable memory, skills. |
| `agents/opus.md`, `agents/gpt6.md` | Specialist subagents (Claude Opus / GPT-6 Sol, high effort), each pinned to one role without an alternate provider. |
| `extensions/orchestrator.ts` | `/auto` selects the `orchestrator` role and persists it as default; `/auto status` shows AUTO/MANUAL in the status line. |
| `codex-lane.yml` | Optional overlay for an isolated Codex-only unattended run (`omp -p --config ./codex-lane.yml …`); keeps automatic model switching disabled. |
| `quota.py` | Classifies `omp usage --json` per provider; stale (>15 min), missing or ambiguous measurements are reported as `unknown`, never as available. |
| `install.sh` / `capture.sh` / `scan.sh` / `files.sh` | Install into, capture from, and secret-scan; `files.sh` lists the mirrored files. |

## Install

1. Install OMP and authenticate the providers you explicitly use. Check that your configured model ids exist with `omp models <provider>`. An explicitly selected OpenRouter model is supported; it is not an automatic fallback.
2. `./install.sh --dry-run`, then `./install.sh`. Only the files in `files.sh` are replaced under `${PI_CODING_AGENT_DIR:-~/.omp/agent}`; each replaced file is backed up to `portable-backups/<timestamp>/`.
3. Check `omp config get tools.approvalMode`, `omp config get retry.modelFallback`, `omp config get retry.usageAwareFallback` and `/auto status`. Both fallback switches must be `false`; the install does not change the approval mode.

If a configured role uses an unavailable provider, choose its replacement explicitly. `enabledProviders` controls foreign user-level configuration discovery, not the model-provider allow-list. Use `disabledProviders` to hide a model provider when needed.

`AGENTS.md` refers to a private memory repository (`~/erdem-memory`) and a personal skills folder; on machines without them those sections are skipped.

## Updating

After changing settings in OMP, run `./capture.sh`: it copies the live files back here and runs `scan.sh`, which fails on anything that looks like a token, key, password or e-mail address. A local pre-commit hook runs the same scan (`ln -s ../../scan.sh .git/hooks/pre-commit`).

## Model selection

- `retry.modelFallback: false` prevents API errors, rate limits and quota exhaustion from switching the chat model. Same-model retries remain enabled.
- `retry.usageAwareFallback: false` prevents quota preflight from selecting a different model before a turn.
- `retry.fallbackRevertPolicy: never` prevents a previous fallback from restoring another model automatically.
- Subagent definitions and overrides each contain one selector, not cross-provider fallback lists. Their explicitly configured roles may differ from the main session model.
- `/model`, `/auto`, role selection and explicit per-run overlays remain deliberate model changes. `/auto` runs only when invoked; its status refresh does not select a model.

Verified using an isolated real OMP RPC process and a local endpoint returning HTTP 429: a configured alternate provider received no requests, no fallback event was emitted, and the selected provider/model remained unchanged when the error was returned. No paid inference was used.

Tools are not rolled back on failure. Preserve the working tree and a compact checkpoint; choose another provider explicitly if necessary.

## Rollback

Copy the files from the backup directory printed by `install.sh` back into `~/.omp/agent` and restart OMP.
