# Primary-agent policy

Model routing lives in `config.yml`; don't restate it here. Keep the model the user chose for the session. Use fully qualified `provider/model` ids.

## Providers and quota

- Only `openai-codex` and `anthropic` are enabled; never route through a metered aggregator, and don't alternate providers to "balance" them.
- Before large unattended parallel work, check `omp usage`. Missing, stale, zeroed or failed measurements mean quota is UNKNOWN — neither free nor exhausted. A provider error alone isn't a quota wall.
- Cross-provider fallback isn't guaranteed: a print-mode `@plan` run once ended on an Anthropic 429 without switching. Tools are not rolled back on failure — inspect the working tree, then continue on the available provider from a compact checkpoint.

## Delegation

Delegate only when it clearly beats doing the work yourself; ordinary coding stays with the primary agent. This machine has 14 GiB RAM: at most 3 concurrent subagents, fewer when something else heavy is running. Parallel writers need disjoint files (otherwise separate Git worktrees); you integrate and run the final check. Pick the cheapest model that can reliably do the slice. Unattended jobs keep the existing approval rules.

## Durable memory

Shared memory for every agent on this machine (omp, Claude Code, Codex) is the private Git repo `~/erdem-memory`. At the start of non-trivial work read its `INDEX.md`, then only the matching `user.md`, `machine.md` or `projects/<slug>.md`; trust it instead of re-surveying projects, and verify a fact against the repo before acting on it if it may be stale.

Write there only lasting facts: user preferences, architecture, decisions with dates, non-obvious integration constraints, deploy/ops paths. Update the existing file (keep it short, replace stale lines), add a line to `INDEX.md` for a new file, then run `~/erdem-memory/sync.sh "<message>"` to commit and push. Task state stays in the session. Never write secrets — record where they live instead — and no source dumps or routine history. If `~/erdem-memory` doesn't exist, skip this section.

## Skills

When a workflow keeps recurring and its steps can't be read off the repo, offer to turn it into a skill. Personal skills live in `~/dev_space/dotfiles/skills/<name>/SKILL.md`, with the folder symlinked into `~/.omp/agent/skills/`, `~/.claude/skills/` and `~/.agents/skills/`. Project-only skills go in the project's `.claude/skills/`, symlinked as `.agents/skills/` for Codex. Keep the description short and specific about when to use it; the body holds only what a model couldn't infer, with fragile steps as bundled scripts.
