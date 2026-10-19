export type Mode = "claude" | "codex";

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
	return { ...(mode === "claude" ? claude : codex) };
}

/** Resolve a role inside the selected mode; explicit model selectors bypass this route. */
export function routeSpawn(mode: Mode, agent: string, role?: string): string {
	const roles = rolesFor(mode);
	const selectedRole = role && role in roles ? role : agent === "sonic" ? "smol" : agent === "opus" ? "plan" : agent === "gpt6" ? "slow" : "task";
	return roles[selectedRole];
}
