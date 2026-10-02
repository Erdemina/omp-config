#!/usr/bin/env python3
"""Classify OMP subscription usage; no credentials or account identifiers printed.

Reads `omp usage --json` by default. Pass --input PATH for deterministic inspection.
A measurement is valid for at most 15 minutes; unknown never means available.
"""
import argparse
import json
import math
import subprocess
import sys
import time

MAX_AGE_MS = 15 * 60 * 1000


def classify(payload, now_ms):
    if not isinstance(payload, dict) or not isinstance(payload.get("reports"), list):
        return {"error": "invalid usage report", "providers": {}}
    results = {}
    for provider in ("openai-codex", "anthropic"):
        reports = [r for r in payload["reports"] if isinstance(r, dict) and r.get("provider") == provider]
        if len(reports) != 1:
            results[provider] = {"state": "unknown", "reason": "missing or multiple accounts"}
            continue
        report = reports[0]
        stamp = report.get("fetchedAt")
        if not isinstance(stamp, (int, float)) or isinstance(stamp, bool) or not math.isfinite(stamp) or not 0 <= now_ms - stamp <= MAX_AGE_MS:
            results[provider] = {"state": "unknown", "reason": "stale or invalid measurement timestamp"}
            continue
        limits = report.get("limits")
        if not isinstance(limits, list) or not limits:
            results[provider] = {"state": "unknown", "reason": "missing usage windows"}
            continue
        windows = []
        for limit in limits:
            if not isinstance(limit, dict):
                break
            window = limit.get("window") or {}
            amount = limit.get("amount") or {}
            used = amount.get("usedFraction")
            reset = window.get("resetsAt")
            if (limit.get("status") not in ("ok", "warning", "exhausted") or
                not isinstance(used, (int, float)) or isinstance(used, bool) or
                not math.isfinite(used) or not 0 <= used <= 1 or
                (reset is not None and (not isinstance(reset, (int, float)) or reset <= now_ms))):
                break
            windows.append({"window": window.get("id", "unknown"), "usedPercent": round(100 * used, 1), "resetAt": reset})
        if len(windows) != len(limits) or all(w["usedPercent"] == 0 for w in windows):
            results[provider] = {"state": "unknown", "reason": "invalid, expired or zeroed usage windows"}
        else:
            exhausted = any(w["usedPercent"] >= 100 or limit["status"] == "exhausted" for w, limit in zip(windows, limits))
            results[provider] = {"state": "limit" if exhausted else "valid", "ageSeconds": round((now_ms - stamp) / 1000), "windows": windows}
    return {"providers": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="OMP usage JSON fixture; otherwise run omp usage --json")
    args = parser.parse_args()
    try:
        if args.input:
            with open(args.input, encoding="utf-8") as source:
                payload = json.load(source)
        else:
            proc = subprocess.run(["omp", "usage", "--json"], capture_output=True, text=True, timeout=20, check=True)
            payload = json.loads(proc.stdout)
        print(json.dumps(classify(payload, int(time.time() * 1000)), separators=(",", ":")))
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"providers": {p: {"state": "unknown", "reason": "usage command or input failed"} for p in ("anthropic", "openai-codex")}}))
        print(f"quota measurement failed: {type(exc).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
