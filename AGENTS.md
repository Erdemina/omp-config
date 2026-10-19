# Primary-agent policy

Model routing lives in `config.yml`; don't restate it here. Keep the model the user chose for the session. Use fully qualified `provider/model` ids.

## Providers and quota

- Preserve the user's explicit model and provider, including an explicitly selected OpenRouter model. Never switch providers automatically or route delegation through a metered aggregator unless explicitly requested.
- Before large unattended parallel work, check `omp usage`. Missing, stale, zeroed or failed measurements mean quota is UNKNOWN — neither free nor exhausted. A provider error alone isn't a quota wall.
- If the selected model is unavailable, report the error instead of choosing another model. Tools are not rolled back on failure; preserve a compact checkpoint so the user can explicitly choose how to continue.

## Delegation

Delegate only when it clearly beats doing the work yourself; ordinary coding stays with the primary agent. At most 2 concurrent subagents, fewer when memory is constrained. Parallel writers need disjoint files; integrate and run the final check once. Use the selected provider mode's roles. Lightweight models are for mechanical tasks, not uncertain engineering. Unattended jobs keep the existing approval rules.

## Effort

Use `defaultThinkingLevel: minimal` for ordinary work. Raise effort only for a specific difficult task. Use `@slow` within the selected provider mode. Do not silently replace a strong coding model with a lightweight model.

## Durable memory

Shared memory for every agent on this machine (omp, Claude Code, Codex) is the private Git repo `~/erdem-memory`. At the start of non-trivial work read its `INDEX.md`, then only the matching `user.md`, `machine.md` or `projects/<slug>.md`; trust it instead of re-surveying projects, and verify a fact against the repo before acting on it if it may be stale.

Write there only lasting facts: project overview, architecture decisions, conventions, constraints, module relationships and known issues. Keep one source of truth; link existing project documentation instead of copying it. Update the existing file and INDEX entry, then run `~/erdem-memory/sync.sh "<message>"` only when that separate repository is available. Never commit application changes as part of memory synchronization. Never write secrets or transcripts.

If the private memory repository is unavailable, use the project's existing README and architecture documentation. Add a concise project memory section to existing documentation when necessary. Do not fail startup or create a second Git repository.

Use `task_checkpoint` for objective, completed work, pending steps, modified files, decisions, tests, failures and next action. Save at meaningful boundaries, before planned compaction or provider transitions. Keep checkpoints under 32 KiB. After `omp --continue` or `omp --resume`, recover state from native history and, when needed, read the saved path in the checkpoint tool result or session entry. Verify files and tool outcomes before continuing; a checkpoint never authorizes replaying side effects. Native history is primary; checkpoints are a safety net. Do not load all memory files into every prompt.

## Skills

When a workflow keeps recurring and its steps can't be read off the repo, offer to turn it into a skill. Personal skills live in `~/dev_space/dotfiles/skills/<name>/SKILL.md`, with the folder symlinked into `~/.omp/agent/skills/`, `~/.claude/skills/` and `~/.agents/skills/`. Project-only skills go in the project's `.claude/skills/`, symlinked as `.agents/skills/` for Codex. Keep the description short and specific about when to use it; the body holds only what a model couldn't infer, with fragile steps as bundled scripts.

## Turkish output (ASD-STE100)

User-facing replies MUST be in Turkish. Apply Simplified Technical English (ASD-STE100) rules to Turkish output:

- One sentence, one idea. Short sentences.
- Active voice. "Düzelttim", not "düzeltildi". Say what you did, not what was done.
- Same concept, same word. Pick one term per concept and keep it.
- No jargon, no metaphor, no idioms. Prefer everyday words.
- State facts, decisions, and risks plainly. No filler, no hedging.
- Code, file names, commands and provider/model ids stay in English; only prose is Turkish.