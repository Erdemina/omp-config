#!/usr/bin/env python3
"""Offline stand-in for the Anthropic Messages API used by tests/runtime.sh.

Streams a fixed text reply and appends one JSON line per request to the log
file (model, thinking/effort fields, system prompt size). If the prompt contains
MOCK_TOOL and no tool result came back yet, it first asks for one `read` call.
No network access.
Usage: mock_anthropic.py PORT LOGFILE
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT, LOG = int(sys.argv[1]), sys.argv[2]
REPLY = "OK"


def sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
        system = body.get("system")
        system_chars = len(json.dumps(system)) if system is not None else 0
        record = {
            "path": self.path,
            "model": body.get("model"),
            "thinking": body.get("thinking"),
            "output_config": body.get("output_config"),
            "max_tokens": body.get("max_tokens"),
            "tools": [t.get("name") for t in body.get("tools") or []],
            "system_chars": system_chars,
            "messages": len(body.get("messages") or []),
        }
        with open(LOG, "a", encoding="utf-8") as log:
            log.write(json.dumps(record) + "\n")
        if not self.path.startswith("/v1/messages") or self.path.startswith("/v1/messages/count_tokens"):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"input_tokens": 10}')
            return
        usage = {"input_tokens": 1200, "output_tokens": 5, "cache_read_input_tokens": 800, "cache_creation_input_tokens": 0}
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        model = body.get("model", "unknown")
        text = json.dumps(body.get("messages") or [])
        if "MOCK_TOOL" in text and "tool_result" not in text:
            block = {"type": "tool_use", "id": "toolu_mock", "name": "read", "input": {}}
            delta = {"type": "input_json_delta", "partial_json": json.dumps({"path": "README.md"})}
            stop = "tool_use"
        else:
            block = {"type": "text", "text": ""}
            delta = {"type": "text_delta", "text": REPLY}
            stop = "end_turn"
        for chunk in (
            sse("message_start", {"type": "message_start", "message": {"id": "msg_mock", "type": "message", "role": "assistant", "model": model, "content": [], "stop_reason": None, "usage": usage}}),
            sse("content_block_start", {"type": "content_block_start", "index": 0, "content_block": block}),
            sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": delta}),
            sse("content_block_stop", {"type": "content_block_stop", "index": 0}),
            sse("message_delta", {"type": "message_delta", "delta": {"stop_reason": stop}, "usage": {"output_tokens": 5}}),
            sse("message_stop", {"type": "message_stop"}),
        ):
            self.wfile.write(chunk)
            self.wfile.flush()


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
