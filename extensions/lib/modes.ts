export type Mode = "claude" | "codex" | "mixed";
export const MODE_ENTRY = "omp-config-mode-v1";
export const isMode = (value: unknown): value is Mode => value === "claude" || value === "codex" || value === "mixed";

const claude = {
	default: "anthropic/claude-sonnet-5-5", orchestrator: "anthropic/claude-opus-5-5:low",
	plan: "anthropic/claude-opus-5-5:low", slow: "anthropic/claude-opus-5-5",
	task: "anthropic/claude-sonnet-5-5:low", smol: "anthropic/claude-haiku-4-5:low",
	tiny: "anthropic/claude-haiku-4-5:low", commit: "anthropic/claude-haiku-4-5:low",
	advisor: "anthropic/claude-sonnet-5-5:low", vision: "anthropic/claude-sonnet-5-5:low",
};
const codex = {
	default: "openai-codex/gpt-6-astra", orchestrator: "openai-codex/gpt-6-sol",
	plan: "openai-codex/gpt-6-sol", slow: "openai-codex/gpt-6-sol",
	task: "openai-codex/gpt-6-astra", smol: "openai-codex/gpt-6-luna",
	tiny: "openai-codex/gpt-6-luna", commit: "openai-codex/gpt-6-luna",
	advisor: "openai-codex/gpt-6-astra", vision: "openai-codex/gpt-6-astra",
};
export function rolesFor(mode: Mode): Record<string, string> {
	return { ...(mode === "claude" ? claude : mode === "codex" ? codex : { ...claude, default: codex.default, slow: codex.slow }) };
}

/** Resolve a role inside the selected mode; explicit model selectors bypass this route. */
export function routeSpawn(mode: Mode, agent: string, role?: string): string {
	const roles = rolesFor(mode);
	const selectedRole = role && role in roles ? role : agent === "sonic" ? "smol" : agent === "opus" ? "plan" : agent === "gpt6" ? "slow" : "task";
	return roles[selectedRole];
}
export function restoreMode(entries: readonly unknown[]): Mode {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (typeof entry !== "object" || entry === null || !("customType" in entry) || entry.customType !== MODE_ENTRY || !("data" in entry)) continue;
		const data = entry.data;
		if (typeof data === "object" && data !== null && "mode" in data && isMode(data.mode)) return data.mode;
	}
	// Safe initial route; /mixed is an explicit opt-in to spending both subscriptions.
	return "codex";
}
