#!/usr/bin/env python3
"""Resource use of OMP sessions, read from their JSONL files.

    tools/session_stats.py SESSION.jsonl|DIR [...]   # directories are searched recursively

Reports only what the session files record: model calls, tokens per bucket,
tool calls, delegations, compactions, model changes and wall time. Reasoning
tokens are summed only where the provider reported them (Anthropic does not);
"reasoningUnknownCalls" counts the rest. Subscription quota is NOT derivable
from these numbers; use `omp usage` for provider-reported limits.
"""
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

BUCKETS = ("input", "output", "cacheRead", "cacheWrite")


def session_files(paths):
    for raw in paths:
        path = Path(raw)
        if path.is_dir():
            yield from sorted(path.rglob("*.jsonl"))
        else:
            yield path


def parse_time(entry):
    stamp = entry.get("timestamp")
    if isinstance(stamp, str):
        try:
            return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return None


def collect(paths):
    totals = Counter()
    by_model = defaultdict(Counter)
    tools = Counter()
    model_changes, times = [], []
    stats = Counter()
    for file in session_files(paths):
        stats["sessions"] += 1
        with open(file, encoding="utf-8") as lines:
            for line in lines:
                try:
                    entry = json.loads(line)
                except ValueError:
                    stats["unparsedLines"] += 1
                    continue
                kind = entry.get("type")
                if (t := parse_time(entry)) is not None:
                    times.append(t)
                if kind == "compaction":
                    stats["compactions"] += 1
                elif kind == "model_change":
                    model_changes.append(entry.get("model"))
                    if entry.get("resolvedModelIsFallback"):
                        stats["fallbackModelChanges"] += 1
                if kind != "message":
                    continue
                message = entry.get("message") or {}
                if message.get("role") != "assistant":
                    continue
                usage = message.get("usage") or {}
                model = f"{message.get('provider')}/{message.get('model')}"
                stats["modelCalls"] += 1
                if message.get("stopReason") in ("error", "aborted"):
                    stats["failedCalls"] += 1
                by_model[model]["calls"] += 1
                for bucket in BUCKETS:
                    value = usage.get(bucket) or 0
                    totals[bucket] += value
                    by_model[model][bucket] += value
                if isinstance(usage.get("reasoningTokens"), int):
                    totals["reasoning"] += usage["reasoningTokens"]
                else:
                    stats["reasoningUnknownCalls"] += 1
                context = sum(usage.get(b) or 0 for b in ("input", "cacheRead", "cacheWrite"))
                stats["maxContextTokens"] = max(stats["maxContextTokens"], context)
                for part in message.get("content") or []:
                    if isinstance(part, dict) and part.get("type") == "toolCall":
                        tools[part.get("name")] += 1
    return {
        "sessions": stats["sessions"],
        "modelCalls": stats["modelCalls"],
        "failedCalls": stats["failedCalls"],
        "tokens": {**{b: totals[b] for b in BUCKETS}, "reasoning": totals["reasoning"]},
        "reasoningUnknownCalls": stats["reasoningUnknownCalls"],
        "maxContextTokens": stats["maxContextTokens"],
        "toolCalls": sum(tools.values()),
        "toolCallsByName": dict(tools.most_common()),
        "delegations": tools["task"],
        "compactions": stats["compactions"],
        "modelChanges": model_changes,
        "fallbackModelChanges": stats["fallbackModelChanges"],
        "byModel": {m: dict(c) for m, c in sorted(by_model.items())},
        "wallSeconds": round(max(times) - min(times), 1) if times else None,
        "unparsedLines": stats["unparsedLines"],
    }


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if argv else 2
    missing = [p for p in argv if not Path(p).exists()]
    if missing:
        print(f"not found: {', '.join(missing)}", file=sys.stderr)
        return 2
    print(json.dumps(collect(argv), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
