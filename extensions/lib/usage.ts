/**
 * `omp usage --json` çıktısını sağlayıcı bazında sınıflandırır.
 * Kimlik bilgisi, hesap tanımlayıcısı, metadata ve hata metni çıktıya girmez.
 * Ölçüm 15 dakikadan eskiyse veya bozuksa sonuç asla `available` olmaz.
 */

export const PROVIDERS = ["anthropic", "openai-codex"] as const;
export const MAX_AGE_MS = 15 * 60 * 1000;
/** Saat farkı toleransı: gelecekteki `fetchedAt` bunu aşarsa ölçüm geçersizdir. */
export const CLOCK_SKEW_MS = 60 * 1000;

export type Provider = (typeof PROVIDERS)[number];
export type UsageStatus = "available" | "exhausted" | "unknown" | "stale" | "disconnected";
export type UsageReason =
	| "measured"
	| "limit-reached"
	| "no-account"
	| "credential-disabled"
	| "usage-unavailable"
	| "invalid-payload"
	| "invalid-measurement"
	| "stale-measurement"
	| "window-reset"
	| "zeroed-measurement"
	| "mixed-accounts";

export type UsageWindow = {
	id: string;
	usedPercent: number;
	remainingPercent: number;
	resetsAt: number | null;
	exhausted: boolean;
};

export type UsageRow = {
	provider: Provider;
	status: UsageStatus;
	reason: UsageReason;
	accounts: number;
	ageSeconds: number | null;
	windows: UsageWindow[];
};

type Account = Pick<UsageRow, "status" | "reason" | "ageSeconds" | "windows">;

const LIMIT_STATUSES: Record<string, true> = { ok: true, warning: true, exhausted: true };
const WINDOW_ID = /^(?:\d{1,3}[mhdw]|primary|secondary|weekly|daily|monthly|session)$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isFraction = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= 1;

/** Gösterim için yuvarlar; sınıflandırma yuvarlanmış değere dayanmaz. */
const percentUsed = (f: number) => (f >= 1 ? 100 : Math.min(99.9, Math.round(f * 1000) / 10));
const percentRemaining = (f: number) => (f <= 0 ? 0 : Math.max(0.1, Math.round(f * 1000) / 10));

function parseLimit(raw: unknown): { window: UsageWindow; used: number } | null {
	if (!isRecord(raw) || typeof raw.status !== "string" || !Object.hasOwn(LIMIT_STATUSES, raw.status)) return null;
	const window = isRecord(raw.window) ? raw.window : null;
	const amount = isRecord(raw.amount) ? raw.amount : null;
	if (!window || !amount) return null;

	let used = amount.usedFraction;
	let remaining = amount.remainingFraction;
	if (used === undefined && isFraction(remaining)) used = 1 - remaining;
	if (remaining === undefined && isFraction(used)) remaining = 1 - used;
	if (!isFraction(used) || !isFraction(remaining) || Math.abs(used + remaining - 1) > 1e-6) return null;

	const reset = window.resetsAt ?? null;
	if (reset !== null && (!isNumber(reset) || reset <= 0)) return null;

	const id = typeof window.id === "string" && WINDOW_ID.test(window.id) ? window.id : "unknown";
	// Gerçek sıfır kalan geçerlidir; durum alanı veya tam kesir tükenmeyi belirler.
	const exhausted = raw.status === "exhausted" || used >= 1 || remaining <= 0;
	return {
		window: {
			id,
			usedPercent: percentUsed(used),
			remainingPercent: percentRemaining(remaining),
			resetsAt: reset,
			exhausted,
		},
		used,
	};
}

function classifyReport(report: Record<string, unknown>, now: number): Account {
	const invalid = (reason: UsageReason): Account => ({ status: "unknown", reason, ageSeconds: null, windows: [] });

	const fetchedAt = report.fetchedAt;
	if (!isNumber(fetchedAt) || fetchedAt <= 0) return invalid("invalid-measurement");
	const age = now - fetchedAt;
	if (age < -CLOCK_SKEW_MS) return invalid("invalid-measurement");
	if (report.error != null || (Array.isArray(report.errors) && report.errors.length > 0)) return invalid("invalid-measurement");

	const limits = report.limits;
	if (!Array.isArray(limits) || limits.length === 0) return invalid("invalid-measurement");
	const parsed = limits.map(parseLimit);
	if (parsed.some(p => p === null)) return invalid("invalid-measurement");
	const entries = parsed as { window: UsageWindow; used: number }[];

	const windows = entries.map(e => e.window);
	const ageSeconds = Math.max(0, Math.round(age / 1000));
	const result = (status: UsageStatus, reason: UsageReason): Account => ({ status, reason, ageSeconds, windows });

	if (age > MAX_AGE_MS) return result("stale", "stale-measurement");
	if (windows.some(w => w.resetsAt !== null && w.resetsAt <= now)) return result("stale", "window-reset");
	if (entries.every(e => e.used === 0)) return result("unknown", "zeroed-measurement");
	if (windows.some(w => w.exhausted)) return result("exhausted", "limit-reached");
	return result("available", "measured");
}

/** Birden fazla hesapta temkinli birleştirir: yalnızca tümü aynıysa o durum çıkar. */
function combine(accounts: Account[]): Account {
	const first = accounts[0];
	const windows = accounts.flatMap(a => a.windows);
	const ages = accounts.map(a => a.ageSeconds);
	const ageSeconds = ages.some(age => age === null) ? null : Math.max(...ages.filter((age): age is number => age !== null));
	if (accounts.every(a => a.status === first.status)) return { ...first, windows, ageSeconds };
	const worst = accounts.find(a => a.status === "unknown") ?? accounts.find(a => a.status === "stale");
	return { status: worst?.status ?? "unknown", reason: worst?.reason ?? "mixed-accounts", ageSeconds, windows };
}

/** `accountsWithoutUsage` / `disabledCredentials` girdileri dize veya nesne olabilir; yalnızca sağlayıcı eşleşmesine bakılır. */
function mentions(list: unknown, provider: Provider): boolean {
	if (!Array.isArray(list)) return false;
	return list.some(entry => {
		const name = typeof entry === "string" ? entry : isRecord(entry) ? entry.provider : undefined;
		return typeof name === "string" && (name === provider || name.startsWith(`${provider}/`));
	});
}

function unavailable(provider: Provider, reason: UsageReason): UsageRow {
	const status: UsageStatus = reason === "no-account" || reason === "credential-disabled" ? "disconnected" : "unknown";
	return { provider, status, reason, accounts: 0, ageSeconds: null, windows: [] };
}

/**
 * Her zaman `anthropic` ve `openai-codex` için birer satır döndürür (sabit sıra).
 * Bozuk veya eksik veri `unknown`, eksik hesap `disconnected` olur.
 */
export function summarizeUsage(payload: unknown, now: number = Date.now()): UsageRow[] {
	if (!isRecord(payload) || !Array.isArray(payload.reports)) {
		return PROVIDERS.map(p => unavailable(p, "invalid-payload"));
	}
	const reports = payload.reports;
	const malformed = reports.some(r => !isRecord(r));

	return PROVIDERS.map(provider => {
		const accounts = reports
			.filter((r): r is Record<string, unknown> => isRecord(r) && r.provider === provider)
			.map(r => classifyReport(r, now));
		if (mentions(payload.accountsWithoutUsage, provider)) {
			accounts.push({ status: "unknown", reason: "usage-unavailable", ageSeconds: null, windows: [] });
		}
		if (accounts.length === 0) {
			if (mentions(payload.disabledCredentials, provider)) return unavailable(provider, "credential-disabled");
			return unavailable(provider, malformed ? "invalid-payload" : "no-account");
		}
		const total = accounts.length;
		return { provider, accounts: total, ...combine(accounts) };
	});
}

function formatReset(resetsAt: number | null, now: number): string {
	if (resetsAt === null) return "";
	const minutes = Math.max(0, Math.round((resetsAt - now) / 60000));
	if (minutes < 60) return ` (${minutes} dk)`;
	const hours = Math.floor(minutes / 60);
	return hours < 48 ? ` (${hours} sa)` : ` (${Math.floor(hours / 24)} gün)`;
}

/** `/quota` bildirimi için tek satırlık özetler. */
export function formatUsage(rows: UsageRow[], now: number = Date.now()): string {
	return rows
		.map(row => {
			const windows = row.windows.map(w => `${w.id}: kullanılan %${w.usedPercent}, kalan %${w.remainingPercent}${formatReset(w.resetsAt, now)}`).join("; ");
			return `${row.provider}: ${row.status} (${row.reason})${windows ? ` — ${windows}` : ""}`;
		})
		.join("\n");
}
