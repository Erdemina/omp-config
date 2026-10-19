import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Checkpoint {
	objective: string;
	completed: string[];
	pending: string[];
	modifiedFiles: string[];
	decisions: string[];
	tests: string[];
	failures: string[];
	nextAction: string;
}
const lists = ["completed", "pending", "modifiedFiles", "decisions", "tests", "failures"] as const;
export function validateCheckpoint(value: unknown): asserts value is Checkpoint {
	if (typeof value !== "object" || value === null) throw new Error("Invalid checkpoint");
	const data = value as Record<string, unknown>;
	if (typeof data.objective !== "string" || typeof data.nextAction !== "string" || lists.some(key => !Array.isArray(data[key]) || data[key].some(item => typeof item !== "string"))) throw new Error("Invalid checkpoint");
	const text = JSON.stringify(value);
	if (text.length > 32_768 || /(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|Bearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|(?:access_token|refresh_token|api_key)\s*[":=])/i.test(text)) throw new Error("Checkpoint rejected: size or secret pattern");
}
export async function checkpointPath(cwd: string, session: string, root = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state")): Promise<string> {
	if (!/^[a-zA-Z0-9_-]{1,128}$/.test(session)) throw new Error("Invalid session id");
	const project = createHash("sha256").update(await realpath(cwd)).digest("hex");
	return join(root, "omp-config", "projects", project, `${session}.json`);
}
export async function saveCheckpoint(path: string, checkpoint: Checkpoint): Promise<void> {
	validateCheckpoint(checkpoint);
	await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), checkpoint }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
		await rename(temporary, path);
	} finally {
		await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
	}
}
export async function loadCheckpoint(path: string): Promise<Checkpoint | undefined> {
	let text: string;
	try { text = await readFile(path, "utf8"); } catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
	const data = JSON.parse(text);
	if (data.version !== 1) throw new Error("Unsupported checkpoint version");
	validateCheckpoint(data.checkpoint);
	return data.checkpoint;
}
