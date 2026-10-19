import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { rolesFor, routeSpawn, type Mode } from "./lib/modes";
import { checkpointPath, saveCheckpoint } from "./lib/checkpoint";

export default function providerModes(pi: ExtensionAPI) {
	let mode: Mode | undefined;
	const { Type } = pi.typebox;
	pi.registerTool({
		name: "task_checkpoint", label: "Task checkpoint", approval: "write",
		description: "Save concise resumable task state at meaningful boundaries. Never include credentials or raw transcripts.",
		parameters: Type.Object({
			objective: Type.String(), completed: Type.Array(Type.String()), pending: Type.Array(Type.String()),
			modifiedFiles: Type.Array(Type.String()), decisions: Type.Array(Type.String()),
			tests: Type.Array(Type.String()), failures: Type.Array(Type.String()), nextAction: Type.String(),
		}),
		async execute(_id, params, _signal, _update, ctx) {
			const path = await checkpointPath(ctx.cwd, ctx.sessionManager.getSessionId());
			await saveCheckpoint(path, params);
			pi.appendEntry("omp-config-checkpoint-v1", { path });
			return { content: [{ type: "text", text: "Checkpoint saved." }], details: { path } };
		},
	});
	const applyRoles = (next: Mode) => {
		lookup("modelRoles").override(pi.pi.settings, rolesFor(next));
		lookup("task.agentModelOverrides").override(pi.pi.settings, {
			task: "@task", scout: "@task", sonic: "@smol", opus: "@plan", gpt6: "@slow",
		});
	};
	const followModel = (ctx: ExtensionContext) => {
		const provider = ctx.models.current()?.provider;
		const next = provider === "anthropic" ? "claude" : provider === "openai-codex" ? "codex" : undefined;
		if (next && next !== mode) {
			mode = next;
			applyRoles(mode);
		}
	};
	for (const event of ["session_start", "session_switch", "session_branch", "session_tree"] as const) {
		pi.on(event, (_event, ctx) => { mode = undefined; followModel(ctx); });
	}
	pi.on("before_agent_start", (event, ctx) => {
		followModel(ctx);
		if (!mode) return;
		return {
			systemPrompt: [...event.systemPrompt,
				`Provider mode: ${mode}. Use only this mode's model roles for delegation. Delegation follows the current main model's provider; never change the main model automatically. Do not use direct completion/advisor calls outside the selected family. Save task_checkpoint at meaningful boundaries, before compaction and before a risky transition. Resume the same native session; never replay side effects from a checkpoint.`],
		};
	});
	pi.on("before_subagent_spawn", event => {
		// An explicit selector belongs to the caller, not to a role override.
		if (!event.modelRole || !mode) return;
		return { model: routeSpawn(mode, event.agent, event.modelRole) };
	});
}
