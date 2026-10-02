/**
 * Primary model selector and skill-use notification.
 * `/auto` selects modelRoles.orchestrator and persists default = @orchestrator.
 * `/auto status` only displays state. The status line shows AUTO or MANUAL.
 */
import type { ExtensionAPI, ExtensionContext, Settings } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";

const ROLE = "orchestrator";
const AUTO_ALIAS = `@${ROLE}`;
const STATUS_KEY = "orchestrator";
const THINKING_LEVELS: Record<string, true> = {
	minimal: true,
	low: true,
	medium: true,
	high: true,
	xhigh: true,
	max: true,
	auto: true,
};

type ModelLike = { provider: string; id: string; name?: string };

export default function orchestrator(pi: ExtensionAPI) {
	const settings = (): Settings | undefined => {
		try {
			return pi.pi.Settings?.instance;
		} catch {
			return undefined;
		}
	};

	const roles = (): Record<string, string> => settings()?.getModelRoles() ?? {};

	const label = (m: ModelLike | undefined) => (m ? (m.name ?? `${m.provider}/${m.id}`) : "?");

	const describe = (ctx: ExtensionContext) => {
		const current = ctx.models.current() as ModelLike | undefined;
		const target = ctx.models.resolve(AUTO_ALIAS) as ModelLike | undefined;
		if (roles().default?.trim() !== AUTO_ALIAS) return { text: `MANUAL · ${label(current)} — /auto`, target };
		const onTarget = !!current && !!target && current.provider === target.provider && current.id === target.id;
		return { text: `AUTO · ${onTarget ? "" : "fallback: "}${label(current)}`, target };
	};

	const refresh = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, describe(ctx).text);
	};

	pi.on("session_start", async (_e, ctx) => refresh(ctx));
	pi.on("turn_start", async (_e, ctx) => refresh(ctx));
	pi.on("agent_end", async (_e, ctx) => refresh(ctx));

	pi.registerCommand("auto", {
		description: "Select the configured primary model (/auto status only displays state)",
		handler: async (args, ctx) => {
			if (args.trim() === "status") {
				const d = describe(ctx);
				ctx.ui.notify(
					`${d.text}\norchestrator = ${roles()[ROLE] ?? "(unset)"} → ${label(d.target)}\ndefault = ${roles().default ?? "(unset)"}`,
					"info",
				);
				return;
			}

			const target = ctx.models.resolve(AUTO_ALIAS);
			if (!target) {
				ctx.ui.notify("`orchestrator` role is unset: configure it in modelRoles", "error");
				return;
			}

			const s = settings();
			if (s) {
				s.setModelRole("default", AUTO_ALIAS);
				await s.flush?.();
			}

			await ctx.waitForIdle();
			if (!(await pi.setModel(target))) {
				ctx.ui.notify(`${label(target)} is not authenticated (/login)`, "error");
				return;
			}
			const roleValue = roles()[ROLE] ?? "";
			const suffix = roleValue.slice(roleValue.lastIndexOf(":") + 1);
			const suffixThinking = THINKING_LEVELS[suffix]
				? suffix
				: s ? lookup("defaultThinkingLevel")?.get(s) : undefined;
			const thinking = typeof suffixThinking === "string" ? suffixThinking : undefined;
			if (thinking) pi.setThinkingLevel(thinking as Parameters<typeof pi.setThinkingLevel>[0]);

			refresh(ctx);
			ctx.ui.notify(
				s
					? `AUTO enabled → ${label(target)}${thinking ? ` (${thinking})` : ""}`
					: `AUTO → ${label(target)} (this session only; could not persist default)`,
				"info",
			);
		},
	});

	// Notify once per skill loaded in this session.
	const announced = new Set<string>();
	pi.on("session_start", async () => announced.clear());

	pi.on("tool_call", async (event, ctx) => {
		if (!ctx.hasUI) return;
		const input = event.input as Record<string, unknown> | undefined;
		let name: string | undefined;
		if (event.toolName === "read" && typeof input?.path === "string" && input.path.startsWith("skill://")) {
			name = input.path.slice("skill://".length).split(/[/:?#]/)[0];
		} else if (event.toolName === "skill" && typeof input?.name === "string") {
			name = input.name;
		}
		if (!name) return;
		const first = !announced.has(name);
		announced.add(name);
		ctx.ui.notify(`🧩 Skill${first ? "" : " (additional file)"}: ${name}`, "info");
	});
}
