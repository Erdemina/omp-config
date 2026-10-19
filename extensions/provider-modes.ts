import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { MODE_ENTRY, rolesFor, restoreMode, routeSpawn, type Mode } from "./lib/modes";
import { summarizeUsage, formatUsage } from "./lib/usage";
import { checkpointPath, loadCheckpoint, saveCheckpoint } from "./lib/checkpoint";

export default function providerModes(pi: ExtensionAPI) {
	let mode: Mode = "codex";
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
	pi.registerCommand("checkpoint", {
		description: "Bu oturumun kayıtlı görev durumunu göster",
		handler: async (_args, ctx) => {
			try {
				const saved = await loadCheckpoint(await checkpointPath(ctx.cwd, ctx.sessionManager.getSessionId()));
				pi.sendMessage({ customType: "omp-config-checkpoint", content: saved ? JSON.stringify(saved, null, 2) : "Bu oturum için görev kaydı yok.", display: true }, { triggerTurn: false });
			} catch {
				ctx.ui.notify("Görev kaydı okunamadı. Mevcut dosya korunuyor.", "error");
			}
		},
	});
	let cached: { at: number; text: string } | undefined;
	const applyRoles = (next: Mode) => {
		lookup("modelRoles").override(pi.pi.settings, rolesFor(next));
		lookup("task.agentModelOverrides").override(pi.pi.settings, {
			task: "@task", scout: "@task", sonic: "@smol", opus: "@plan", gpt6: "@slow",
		});
	};
	const select = async (next: Mode, ctx: ExtensionContext, persist: boolean) => {
		if (!ctx.isIdle() || (ctx.getAsyncJobSnapshot()?.running.length ?? 0) > 0) {
			ctx.ui.notify("Önce çalışan işi durdurun veya bitmesini bekleyin.", "warning");
			return;
		}
		const model = ctx.models.resolve(rolesFor(next).default);
		if (!model || !await pi.setModel(model)) {
			ctx.ui.notify("İstenen sağlayıcı kullanılamıyor. Model değişmedi.", "error");
			return;
		}
		applyRoles(next);
		mode = next;
		if (persist) pi.appendEntry(MODE_ENTRY, { mode });
	};
	const restore = async (ctx: ExtensionContext) => {
		mode = restoreMode(ctx.sessionManager.getBranch());
		applyRoles(mode);
	};
	// Native session restoration owns the main model; never replace an explicit CLI model.
	pi.on("session_start", async (_event, ctx) => { await restore(ctx); });
	pi.on("session_switch", async (_event, ctx) => { await restore(ctx); });
	pi.on("session_branch", async (_event, ctx) => { await restore(ctx); });
	pi.on("session_tree", async (_event, ctx) => { await restore(ctx); });
	pi.on("before_agent_start", event => ({
		systemPrompt: [...event.systemPrompt,
			`Provider mode: ${mode}. Use only this mode's model roles for delegation. Native /model is an explicit main-model override. Do not use direct completion/advisor calls outside the selected family. Save task_checkpoint at meaningful boundaries, before compaction and before a risky transition. Resume the same native session; never replay side effects from a checkpoint.`],
	}));
	pi.on("before_subagent_spawn", event => {
		// An explicit selector belongs to the caller, not to a role override.
		if (!event.modelRole) return;
		return { model: routeSpawn(mode, event.agent, event.modelRole) };
	});
	for (const next of ["claude", "codex", "mixed"] as const) {
		pi.registerCommand(next, {
			description: `${next}: aynı oturumda sağlayıcı seçimi`,
			handler: async (_args, ctx) => { await select(next, ctx, true); },
		});
	}
	pi.registerCommand("quota", {
		description: "Claude ve Codex için güvenli kota özeti; /usage yerleşik kalır",
		handler: async (_args, ctx) => {
			if (!cached || Date.now() - cached.at >= 60_000) {
				try {
					const result = await pi.exec("omp", ["usage", "--json"], { timeout: 20_000 });
					if (result.code !== 0) throw new Error("usage unavailable");
					cached = { at: Date.now(), text: formatUsage(summarizeUsage(JSON.parse(result.stdout), Date.now())) };
				} catch {
					cached = undefined;
					ctx.ui.notify("Claude: unknown. Codex: unknown. Kota verisi alınamadı; sağlayıcı değişmedi.", "warning");
					return;
				}
			}
			pi.sendMessage({ customType: "omp-config-quota", content: cached.text, display: true }, { triggerTurn: false });
		},
	});
}
