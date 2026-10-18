# omp-config

A small, provider-isolated configuration for [OMP](https://github.com/can1357/oh-my-pi) (oh-my-pi):
one main agent per task, explicit effort control, and either Claude-only or Codex-only model use.
Every setting and model id is checked against the installed omp by `bun test` (last verified: omp 18.12.1).

No credentials, sessions or databases live here. Authentication stays in `~/.omp/agent`.

## Layout

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Global agent policy, loaded into every session (≈1.5 KB). |
| `config/common.yml` | Settings shared by both profiles. |
| `config/claude.yml`, `config/codex.yml` | Profile: model roles, provider block, model scope. |
| `install.ts` | Install a profile, switch profiles, roll back. |
| `scan.sh` | Secret / e-mail scan of tracked files (use as pre-commit hook). |
| `tools/session_stats.py` | Tokens, calls, tool calls, delegations, compactions per session. |
| `bench/` | Reproducible benchmark: fixture repo, 6 tasks, hidden checks, runner, summary. |
| `tests/` | Config/schema, install/rollback, benchmark self-check, offline runtime tests. |

Before → after:

```
before                          after
├── AGENTS.md  (3.7 KB)         ├── AGENTS.md  (1.5 KB, rewritten)
├── config.yml                  ├── config/{common,claude,codex}.yml
├── codex-lane.yml              ├── install.ts
├── agents/{opus,gpt6}.md       ├── scan.sh
├── extensions/orchestrator.ts  ├── tools/session_stats.py
├── quota.py                    ├── bench/{run.sh,offline.sh,summarize.py,tasks.json,fixture/,checks/,solutions/}
├── install.sh capture.sh       └── tests/{*.test.ts,omp.ts,runtime.sh,run.sh,mock_anthropic.py}
├── files.sh scan.sh
└── README.md
```

## How it works

**Single agent first.** `AGENTS.md` tells the agent to do the work itself and delegate only
independent, bounded work. `task.maxConcurrency: 1` and `task.maxRecursionDepth: 1` keep any
delegation sequential and one level deep. There is no planner, classifier or orchestrator layer.

**Three effort strategies, native controls, no extra model calls.**

| Strategy | How to select | Claude profile | Codex profile |
| --- | --- | --- | --- |
| FAST | Ctrl+P → `smol` role | `claude-haiku-5-5:low` | `gpt-6-luna:low` |
| BALANCED (start) | `default` role | `claude-sonnet-5-5:medium` | `gpt-6-sol:medium` |
| DEEP | Ctrl+P → `slow` role | `claude-opus-5-5:high` | `gpt-6-astra:high` |

Ctrl+P cycles FAST → BALANCED → DEEP and applies each role's effort suffix (per omp's
`applyRoleModel` source; the TUI key itself is not covered by the automated tests). To change only the effort on the current model use Shift+Tab or
`/effort low|medium|high|xhigh|max`. `/model` and `--model provider/id[:level]` still override.
Switching is manual on purpose: omp's automatic `auto` thinking level asks a judge model on
every prompt, i.e. one extra model call per turn, so it is not enabled.

**Provider isolation.** Each profile sets every role explicitly (including background roles:
`commit`, `tiny`, `judge`), blocks the other subscription with `disabledProviders`, and limits
startup and the model picker with `enabledModels`. Model fallback, usage-aware fallback and
context promotion are off. Verified behavior (`tests/runtime.sh`):

- a Codex model in the Claude profile is rejected with "Provider is disabled", no request sent;
- a profile whose provider is not logged in stops with "No model available matching enabledModels"
  instead of starting on another logged-in provider (OpenRouter, Bedrock, the other subscription);
- an explicit `--model openrouter/...` is still honored (deliberate choice, not a fallback).

The previous config did not have this: with Codex not logged in it silently started on
`anthropic/claude-opus-5-5` (reproduced offline against a mock endpoint).

The Claude scope lists exact ids because the glob `anthropic/*` also matches OpenRouter's
`anthropic/claude-…` ids (omp matches globs against bare ids too). The test suite checks every
profile's scope against every other provider in the catalog.

## Install

Requires omp (and therefore bun). Log in to the provider you will use (`/login` in omp).

```sh
./install.ts --profile claude --dry-run   # show the generated config.yml, write nothing
./install.ts --profile claude             # or: --profile codex
```

The installer writes `config.yml`, `AGENTS.md` and `profiles/{claude,codex}.yml` under
`${PI_CODING_AGENT_DIR:-~/.omp/agent}`. It:

- backs up every file it replaces to `omp-config-backups/<timestamp>/` with a `manifest.json`;
- keeps settings it does not manage (approval mode, theme, `codexResets`, …) from your existing `config.yml`;
- removes settings and files that only the previous version of this repo created
  (`compaction.thresholdTokens`, `compaction.idle*`, `task.maxRuntimeMs`, `task.softRequestBudget`,
  `task.agentModelOverrides`, `agents/opus.md`, `agents/gpt6.md`, `extensions/orchestrator.ts`);
- never touches `agent.db`, sessions or other credentials.

Then check: `omp config get modelRoles`, `omp config get tools.approvalMode`.

## Claude-only use

```sh
./install.ts --profile claude
omp                                   # starts on claude-sonnet-5-5, medium effort
```

Codex models are blocked. If you are not logged in to Anthropic, omp stops instead of switching.

## Codex-only use

```sh
./install.ts --profile codex
omp                                   # starts on gpt-6-sol, medium effort
```

Anthropic is blocked. Image generation uses `openai-codex/gpt-image-2`.

**One run on the other profile** without reinstalling (the overlay replaces roles, provider
block and scope as a whole):

```sh
omp --config ~/.omp/agent/profiles/codex.yml
alias omp-codex='omp --config ~/.omp/agent/profiles/codex.yml'   # optional
```

While an overlay is active, role edits made in the model hub are saved to `config.yml`
but the overlay keeps winning for that run.

## Rollback

The installer prints the backup path and the exact command:

```sh
./install.ts --restore ~/.omp/agent/omp-config-backups/<timestamp>
```

This restores replaced files byte for byte and deletes files the install created. Restart omp.

## Settings and why

| Setting | Value | Reason |
| --- | --- | --- |
| `defaultThinkingLevel` | `medium` | BALANCED for models chosen without a suffix. The old `minimal` is not supported by Claude/GPT 5.5–6 models; omp clamped it to `low`. |
| `cycleOrder`, `modelTags` | smol, default, slow | Ctrl+P = FAST / BALANCED / DEEP, labelled in the status line. |
| `retry.modelFallback`, `retry.usageAwareFallback` | `false` | No model switch on errors or quota. |
| `retry.fallbackRevertPolicy` | `never` | No automatic return to another model. |
| `contextPromotion.enabled` | `false` | No switch to a larger-context model on overflow (pinned; omp default). |
| `task.maxConcurrency` / `maxRecursionDepth` | `1` / `1` | Conservative delegation; omp defaults are 32 / 2. |
| `task.completionProbe` | `false` | Default sends side requests to running subagents (at 2, 5, 10, 30 min) only to estimate progress. |
| `task.enableEffort`, `task.showResolvedModelBadge` | `true` | Per-spawn effort instead of a raised lane; shows which model a subagent really used. |
| `compaction.modelThresholds` | `anthropic/*: 300000` | 1M-window Claude models compact at ≈255k instead of ≈850k. Codex 272k models keep the built-in ≈231k. Replaces the old fixed 25k trigger, which forced frequent summaries and re-reads, and the 40k idle compaction. Server-side compaction stays first in `compaction.methodOrder` (omp default). |
| `title.generator`, `title.refreshOnReplan` | `tiny`, `false` | Titles from the cheap `tiny` role instead of a side turn on the main model, and only once. |
| `recap.enabled` | `false` | No LLM recap after idle time. |
| `dev.autoqa` | `false` | No automatic tool-issue reports (tool calls plus data sent to qa.omp.sh). |

Left at omp defaults on purpose: `compaction.asyncEnabled` (background summary near the
threshold hides latency; no evidence that disabling saves tokens), `compaction.supersedeReads`
and `compaction.dropUseless` (already prune repeated reads and empty results),
`providers.cacheWarming` (idle warming does not run for 1h subscriber caches and only runs
when the dollar estimate says it pays), `ttsr.judge: auto` (judges only when the `judge` role is
a TypeSafe model; both profiles pin `judge` to their small model, so it never fires), memory backends (off).

Upstream `docs/settings.md` on `main` does not list `task.completionProbe`, `task.maxRecursionDepth`
or `title.generator`; they exist in the 18.12.1 settings registry, which the tests use.

## Quota and usage

- Provider-reported limits: `omp usage` (`--redact`, `--history`, `-p anthropic`). Unknown stays unknown.
- Per-session consumption: `tools/session_stats.py ~/.omp/agent/sessions/<dir>` reports input,
  output, cache read/write tokens, reasoning tokens where the provider reports them, model calls
  per model, tool calls, delegations, compactions and model changes. Token counts are not
  converted to subscription quota; there is no provider evidence for such a mapping.
- Aggregates across sessions: `omp stats --json`.

## Benchmark

`bench/` compares configurations by **resource use per correctly completed task**.
Six tasks on a small Python fixture: simple modification, small bug fix, multi-file feature,
debugging, refactoring, test-driven repair. Each has a hidden check; `tests/bench.test.ts`
proves every check fails on the fixture and passes with a reference patch.

```sh
bench/run.sh --label new                 # dry run: prints the plan
bench/run.sh --label new --run           # real sessions with the installed config (spends quota)
bench/run.sh --label new --run --model anthropic/claude-sonnet-5-5   # fixed model for a controlled comparison
bench/summarize.py                       # per label: success rate, tokens/calls/time per success
```

Comparing with the previous config: `git worktree add ../omp-old 2204e7a && ../omp-old/install.sh`,
run with `--label old`, then `./install.ts --restore …` and install the new profile.
For Claude Code or Codex CLI baselines, run the same prompts on copies of `bench/fixture` and
apply the same checks manually; the harness does not drive those CLIs.

**Measured so far (offline, mock endpoint, no paid calls; `bench/offline.sh`):**

| Same model, prompt "say ok" | old | new |
| --- | --- | --- |
| System prompt per request | 14,789 chars | 12,331 chars (−17%) |
| Tool schemas | 11 | 11 |
| Requests | 1 | 1 |
| Effort sent to the provider | `low` (clamped from `minimal`) | `medium` |

New sends a higher default effort on purpose (correctness first). Whether that lowers total cost
per solved task is not measured: no live benchmark has been run, so no token or quota saving is claimed.

## Tests

```sh
tests/run.sh       # = bun test && tests/runtime.sh && ./scan.sh
```

- `bun test`: every key is a registered omp setting with a valid value; every role model exists in
  the catalog and supports its effort; background roles resolve inside the profile's provider even
  with OpenRouter logged in; scopes match no foreign model; install merge, retirement, idempotence,
  profile switch and rollback; benchmark checks.
- `tests/runtime.sh`: real omp binary, throwaway HOME, mock Anthropic endpoint (see above).

Set `OMP_PKG` (package dir) or `OMP_BIN` (command) if `omp` is not on `PATH`.
Pre-commit hook: `ln -s ../../scan.sh .git/hooks/pre-commit`.

## Limitations

- Model availability on your account is not verifiable offline. The tests check omp's bundled
  catalog; run `omp models anthropic` / `omp models openai-codex` once after logging in.
  If you run an older omp, `bun test` reports any id or key it does not know.
- Codex behavior was tested only as "not logged in" (no Codex credentials here); Claude runs used a mock.
- FAST/BALANCED/DEEP selection is manual. No automatic per-task routing exists in this config.
- The `image` role exists only in the Codex profile; in the Claude profile omp's default image
  chain applies if you explicitly ask for image generation.
- `AGENTS.md` keeps one personal rule (Turkish, ASD-STE100 replies); delete that line if not wanted.

## Removed

| Removed | Why |
| --- | --- |
| `extensions/orchestrator.ts` (`/auto`) | Only set `default` to a custom `orchestrator` role and showed a status line; Ctrl+P roles do this natively. Also notified on skill loads (UI only). |
| `agents/opus.md`, `agents/gpt6.md` | Cross-provider specialists (`@plan` = Claude, `@slow` = Codex) that encouraged delegation; bundled `task`/`reviewer` agents use profile roles. |
| `codex-lane.yml` | Replaced by `config/codex.yml`, which is a full profile and an overlay at the same time. |
| `quota.py` | Re-labelled `omp usage --json` and treated a genuine 0% window as unknown; `omp usage` already reports provider limits. Token accounting moved to `tools/session_stats.py`. |
| `capture.sh`, `files.sh`, `install.sh` | Copying the live config back would publish unmanaged personal settings; replaced by generated config plus merge-preserving `install.ts` with rollback. |
| Old settings | Fixed 25k compaction, idle compaction, `task.softRequestBudget` 80, `task.maxRuntimeMs`, `agentModelOverrides`, `minimal` effort, invalid `openai-codex/gpt-image-1`, mixed-provider roles; auto-QA reporting is now off (`dev.autoqa: false`). |
| `AGENTS.md` sections | Private memory repo, personal skill paths, machine RAM note, quota procedure. |
