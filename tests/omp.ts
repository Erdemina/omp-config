/**
 * Locates the installed omp package so tests check this config against the
 * real settings registry and model catalog instead of a copied schema.
 * Set OMP_PKG to the package root, or have `omp` on PATH.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

function findPackage(): string {
	if (process.env.OMP_PKG) return process.env.OMP_PKG;
	const bin = Bun.which("omp");
	if (!bin) throw new Error("omp not found: install it or set OMP_PKG to the @oh-my-pi/pi-coding-agent directory");
	let dir = dirname(realpathSync(bin));
	while (dir !== dirname(dir)) {
		const manifest = join(dir, "package.json");
		if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "@oh-my-pi/pi-coding-agent") return dir;
		dir = dirname(dir);
	}
	throw new Error(`could not find the omp package above ${bin}; set OMP_PKG`);
}

export const PKG = findPackage();
export const VERSION: string = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version;

const src = (path: string) => import(join(PKG, "src", path));
const dep = (spec: string) => import(Bun.resolveSync(spec, PKG));

await src("config/all-settings.ts");
export const { lookup } = await src("config/registry.ts");
export const { Settings } = await src("config/settings.ts");
export const { resolveRoleChain, filterAvailableModelsByEnabledPatterns } = await src("config/model-resolver.ts");
export const { cfgDisabledProviders } = await src("config/model-settings.ts");
export const { validateModelCompactionThresholds } = await src("config/compaction-threshold.ts");
export const { getBundledModels, getBundledProviders } = await dep("@oh-my-pi/pi-catalog/models");
export const { getSupportedEfforts } = await dep("@oh-my-pi/pi-catalog/model-thinking");
