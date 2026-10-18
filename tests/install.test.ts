/** install.ts against a throwaway agent directory: merge, backup, profile switch, rollback. */
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const dest = mkdtempSync(join(tmpdir(), "omp-agent-"));
afterAll(() => rmSync(dest, { recursive: true, force: true }));

function run(...args: string[]) {
	const proc = Bun.spawnSync(["bun", join(ROOT, "install.ts"), ...args], {
		env: { ...process.env, PI_CODING_AGENT_DIR: dest },
	});
	return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() };
}
const read = (rel: string) => readFileSync(join(dest, rel), "utf8");
const config = () => Bun.YAML.parse(read("config.yml")) as Record<string, any>;

// A machine with the previous omp-config installed, user settings, and credentials.
const OLD_CONFIG = `modelRoles:
  orchestrator: anthropic/claude-opus-5-5:low
  default: openai-codex/gpt-6-astra
modelTags:
  orchestrator: { name: Primary (AUTO), color: success }
defaultThinkingLevel: minimal
task:
  maxConcurrency: 2
  maxRuntimeMs: 2700000
  agentModelOverrides: { task: "@task" }
compaction:
  thresholdTokens: 25000
  idleEnabled: true
tools:
  approvalMode: write
codexResets:
  autoRedeem: "yes"
`;
const originals: Record<string, string> = {
	"config.yml": OLD_CONFIG,
	"AGENTS.md": "old policy\n",
	"agents/opus.md": "old agent\n",
	"extensions/orchestrator.ts": "// old extension\n",
	"agent.db": "credentials stand-in\n",
};
for (const [rel, text] of Object.entries(originals)) {
	mkdirSync(join(dest, rel, ".."), { recursive: true });
	writeFileSync(join(dest, rel), text);
}

test("usage errors exit 2", () => {
	expect(run().code).toBe(2);
	expect(run("--profile", "gemini").code).toBe(2);
});

test("dry run writes nothing", () => {
	const { code, out } = run("--profile", "claude", "--dry-run");
	expect(code).toBe(0);
	expect(out).toContain("anthropic/claude-sonnet-5-5:medium");
	expect(read("config.yml")).toBe(OLD_CONFIG);
	expect(existsSync(join(dest, "omp-config-backups"))).toBe(false);
});

let firstBackup = "";
test("install merges, retires old keys and files, and backs up", () => {
	const { code, out } = run("--profile", "claude");
	expect(code).toBe(0);
	firstBackup = out.match(/Backup: (.+)/)![1].trim();

	const c = config();
	expect(c.modelRoles.default).toBe("anthropic/claude-sonnet-5-5:medium");
	expect(c.modelRoles.orchestrator).toBeUndefined();
	expect(c.modelTags.orchestrator).toBeUndefined();
	expect(c.disabledProviders).toEqual(["openai-codex"]);
	expect(c.defaultThinkingLevel).toBe("medium");
	expect(c.task.maxConcurrency).toBe(1);
	expect(c.task.maxRuntimeMs).toBeUndefined();
	expect(c.task.agentModelOverrides).toBeUndefined();
	expect(c.compaction.thresholdTokens).toBeUndefined();
	expect(c.compaction.idleEnabled).toBeUndefined();
	// Unmanaged user settings survive.
	expect(c.tools.approvalMode).toBe("write");
	expect(c.codexResets.autoRedeem).toBe("yes");

	expect(read("AGENTS.md")).toBe(readFileSync(join(ROOT, "AGENTS.md"), "utf8"));
	expect(read("profiles/codex.yml")).toBe(readFileSync(join(ROOT, "config/codex.yml"), "utf8"));
	expect(existsSync(join(dest, "agents/opus.md"))).toBe(false);
	expect(existsSync(join(dest, "extensions/orchestrator.ts"))).toBe(false);
	expect(read("agent.db")).toBe(originals["agent.db"]);

	expect(readFileSync(join(firstBackup, "config.yml"), "utf8")).toBe(OLD_CONFIG);
	expect(readFileSync(join(firstBackup, "agents/opus.md"), "utf8")).toBe(originals["agents/opus.md"]);
	const manifest = JSON.parse(readFileSync(join(firstBackup, "manifest.json"), "utf8"));
	expect(manifest.created.sort()).toEqual(["profiles/claude.yml", "profiles/codex.yml"]);
});

test("reinstall is idempotent and switching profiles replaces every role", () => {
	const before = read("config.yml");
	expect(run("--profile", "claude").code).toBe(0);
	expect(read("config.yml")).toBe(before);

	expect(run("--profile", "codex").code).toBe(0);
	const c = config();
	expect(Object.values(c.modelRoles).every(v => String(v).startsWith("openai-codex/"))).toBe(true);
	expect(c.disabledProviders).toEqual(["anthropic"]);
	expect(c.tools.approvalMode).toBe("write");
	expect(readdirSync(join(dest, "omp-config-backups")).length).toBe(3);
});

test("restore returns the original files and removes created ones", () => {
	expect(run("--restore", firstBackup).code).toBe(0);
	for (const [rel, text] of Object.entries(originals)) expect(read(rel)).toBe(text);
	expect(existsSync(join(dest, "profiles/claude.yml"))).toBe(false);
	expect(existsSync(join(dest, "profiles/codex.yml"))).toBe(false);
});
