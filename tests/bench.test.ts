/** Benchmark self-check: each hidden check fails on the fixture and passes with the reference patch. */
import { expect, test } from "bun:test";
import { cpSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BENCH = join(import.meta.dir, "..", "bench");
const tasks = (await Bun.file(join(BENCH, "tasks.json")).json()) as Array<{ id: string; tests: string[] }>;

function sh(cwd: string, ...cmd: string[]) {
	return Bun.spawnSync(cmd, { cwd, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }).exitCode;
}

test.each(tasks.map(t => [t.id, t] as const))("%s", (id, task) => {
	const repo = mkdtempSync(join(tmpdir(), `bench-${id}-`));
	try {
		cpSync(join(BENCH, "fixture"), repo, { recursive: true });
		copyFileSync(join(BENCH, "checks", `${id}.py`), join(repo, "tests/test_zz_check.py"));
		const check = () => sh(repo, "python3", "-m", "unittest", "-q", "tests.test_zz_check", ...task.tests);
		expect(check(), "check must fail before the fix").not.toBe(0);
		expect(sh(repo, "git", "apply", join(BENCH, "solutions", `${id}.patch`))).toBe(0);
		expect(check(), "check must pass with the reference patch").toBe(0);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
