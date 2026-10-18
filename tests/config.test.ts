/** Static checks of config/*.yml against the installed omp (no network, no model calls). */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	Settings,
	VERSION,
	cfgDisabledProviders,
	filterAvailableModelsByEnabledPatterns,
	getBundledModels,
	getBundledProviders,
	getSupportedEfforts,
	lookup,
	resolveRoleChain,
	validateModelCompactionThresholds,
} from "./omp";
import { buildConfig } from "../install";

const ROOT = join(import.meta.dir, "..");
const load = (name: string) => Bun.YAML.parse(readFileSync(join(ROOT, "config", name), "utf8")) as Record<string, any>;
const PROFILES = { claude: "anthropic", codex: "openai-codex" } as const;
const ALL_PROVIDERS = Object.values(PROFILES);
const LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Every leaf key path, stopping at keys omp registers as a single setting (records, arrays). */
function settingIds(tree: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
	return Object.entries(tree).flatMap(([key, value]) => {
		const id = prefix ? `${prefix}.${key}` : key;
		if (lookup(id)) return [[id, value] as [string, unknown]];
		if (value && typeof value === "object" && !Array.isArray(value)) return settingIds(value as Record<string, unknown>, id);
		return [[id, value] as [string, unknown]];
	});
}

function parseSelector(selector: string) {
	const [ref, level] = selector.split(/:(?=[a-z]+$)/);
	const slash = ref.indexOf("/");
	return { provider: ref.slice(0, slash), id: ref.slice(slash + 1), level };
}

function catalogModel(provider: string, id: string) {
	return getBundledModels(provider).find((m: { id: string }) => m.id === id);
}

console.log(`checking against omp ${VERSION}`);

describe.each(["common.yml", "claude.yml", "codex.yml"])("%s", name => {
	test("every key is a registered omp setting with a valid value", () => {
		for (const [id, value] of settingIds(load(name))) {
			const setting = lookup(id);
			expect(setting, `unknown setting ${id}`).toBeDefined();
			const def = setting.definition;
			if (def.type === "enum") expect(def.values, id).toContain(value);
			else if (def.type === "array") expect(Array.isArray(value), id).toBe(true);
			else if (def.type === "record") expect(typeof value === "object" && !Array.isArray(value), id).toBe(true);
			else expect(typeof value, id).toBe(def.type);
		}
	});
});

test("compaction thresholds parse", () => {
	expect(() => validateModelCompactionThresholds(load("common.yml").compaction.modelThresholds)).not.toThrow();
});

describe.each(Object.entries(PROFILES))("%s profile", (profile, provider) => {
	const roles = load(`${profile}.yml`).modelRoles as Record<string, string>;

	test("roles use only this provider, exist in the catalog, and request supported effort", () => {
		for (const [role, selector] of Object.entries(roles)) {
			const { provider: p, id, level } = parseSelector(selector);
			expect(p, `${role} provider`).toBe(provider);
			const model = catalogModel(p, id);
			expect(model, `${role}: ${p}/${id} not in omp ${VERSION} catalog`).toBeDefined();
			if (level) {
				expect(LEVELS.has(level), `${role} level ${level}`).toBe(true);
				expect(getSupportedEfforts(model), `${role}: ${id} does not support ${level}`).toContain(level);
			}
		}
	});

	test("defaultThinkingLevel is supported by the default model", () => {
		const { provider: p, id } = parseSelector(roles.default);
		expect(getSupportedEfforts(catalogModel(p, id))).toContain(load("common.yml").defaultThinkingLevel);
	});

	test("the other subscription provider is disabled", () => {
		const others = ALL_PROVIDERS.filter(p => p !== provider);
		expect(load(`${profile}.yml`).disabledProviders).toEqual(others);
	});

	test("enabledModels covers every role model and matches nothing from any other provider", () => {
		const patterns = load(`${profile}.yml`).enabledModels as string[];
		const own = filterAvailableModelsByEnabledPatterns(getBundledModels(provider), patterns).map(
			(m: { id: string }) => m.id,
		);
		for (const selector of Object.values(roles)) expect(own).toContain(parseSelector(selector).id);
		const foreign = getBundledProviders()
			.filter((p: string) => p !== provider)
			.flatMap((p: string) => getBundledModels(p));
		const leaked = filterAvailableModelsByEnabledPatterns(foreign, patterns).map(
			(m: { provider: string; id: string }) => `${m.provider}/${m.id}`,
		);
		expect(leaked).toEqual([]);
	});

	test("every role used in the background resolves inside the provider", async () => {
		const config = buildConfig({}, profile as "claude" | "codex");
		const dir = mkdtempSync(join(tmpdir(), "omp-config-"));
		writeFileSync(join(dir, "config.yml"), Bun.YAML.stringify(config));
		const settings = await Settings.loadReadOnly({ agentDir: dir, cwd: dir });
		expect(settings.getModelRoles()).toEqual(config.modelRoles);
		expect(cfgDisabledProviders.get(settings)).toEqual(config.disabledProviders);
		// Pool: both subscriptions plus a metered aggregator, minus disabled providers,
		// as if the user were logged in to all of them.
		const disabled = new Set(config.disabledProviders as string[]);
		const pool = [...ALL_PROVIDERS, "openrouter"].filter(p => !disabled.has(p)).flatMap(p => getBundledModels(p));
		for (const role of ["default", "smol", "slow", "plan", "task", "vision", "commit", "tiny", "judge", "memory"]) {
			const first = resolveRoleChain(role, settings, pool)[0];
			expect(first?.model.provider, `${role} resolves to ${first?.model.provider}/${first?.model.id}`).toBe(provider);
		}
		rmSync(dir, { recursive: true });
	});
});

test("both profiles define the same roles (image generation exists only on Codex)", () => {
	const keys = (p: string) => Object.keys(load(`${p}.yml`).modelRoles).filter(r => r !== "image").sort();
	expect(keys("claude")).toEqual(keys("codex"));
});

test("common.yml holds no provider-specific keys", () => {
	const common = load("common.yml");
	expect(common.modelRoles).toBeUndefined();
	expect(common.disabledProviders).toBeUndefined();
});
