#!/usr/bin/env python3
"""Compare benchmark labels from bench/run.sh results.

    bench/summarize.py [results.jsonl]

Primary metric: resource use per correctly completed task, i.e. totals over ALL
runs of a label (failed runs included) divided by the number of successes.
A label with fewer successes is worse even when it used fewer tokens.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

FIELDS = ("modelCalls", "toolCalls", "delegations", "compactions", "seconds")
TOKENS = ("input", "output", "cacheRead", "cacheWrite")


def summarize(rows):
    labels = defaultdict(list)
    for row in rows:
        labels[row["label"]].append(row)
    out = {}
    for label, runs in labels.items():
        ok = sum(1 for r in runs if r.get("success"))
        totals = {f: sum(r.get(f) or 0 for r in runs) for f in FIELDS}
        totals.update({t: sum((r.get("tokens") or {}).get(t, 0) for r in runs) for t in TOKENS})
        out[label] = {
            "runs": len(runs),
            "successes": ok,
            "successRate": round(ok / len(runs), 3),
            "perSuccess": {k: round(v / ok, 1) for k, v in totals.items()} if ok else None,
            "fallbackModelChanges": sum(r.get("fallbackModelChanges") or 0 for r in runs),
            "failedTasks": sorted(r["task"] for r in runs if not r.get("success")),
        }
    return out


def main(argv):
    path = Path(argv[0] if argv else Path(__file__).with_name("results.jsonl"))
    if not path.exists():
        print(f"no results at {path}; run bench/run.sh --label NAME --run first", file=sys.stderr)
        return 2
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    print(json.dumps(summarize(rows), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
