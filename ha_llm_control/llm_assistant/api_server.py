"""Local-only HTTP API used by the HA-SmartBlock Node adapter."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .assistant_service import create_assistant_response
from .provider import public_provider_catalog


class AssistantHandler(BaseHTTPRequestHandler):
    server_version = "HALlmAssistant/0.1"

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True, "service": "llm_assistant"})
            return
        if self.path == "/v1/providers":
            self._json(200, public_provider_catalog())
            return
        self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/assistant":
            self._json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError("Request body must be between 1 and 1,000,000 bytes.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Request body must be a JSON object.")
        except (UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})
            return
        self._json(200, create_assistant_response(payload))

    def log_message(self, _format: str, *_args) -> None:
        return


def run(host: str = "127.0.0.1", port: int = 8792) -> None:
    server = ThreadingHTTPServer((host, port), AssistantHandler)
    print(f"LLM assistant API listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
