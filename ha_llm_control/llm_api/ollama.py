"""Ollama transport for the same provider-neutral planner and response stages."""
from __future__ import annotations

import json
import urllib.request

from .base import LLMClient
from ..modules.core.config import get_env, get_llm_temperature


class OllamaClient(LLMClient):
    def __init__(self):
        self.model = get_env("OLLAMA_MODEL", "qwen3:4b")
        self.base_url = get_env("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")

    def generate_text(self, prompt, system_prompt=None, max_tokens=1200):
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": self.model, "messages": messages, "stream": False,
            "think": get_env("OLLAMA_THINK", "false").lower() == "true",
            "options": {"temperature": get_llm_temperature(), "seed": int(get_env("OLLAMA_SEED", "42")), "num_predict": max_tokens},
        }
        request = urllib.request.Request(
            self.base_url + "/api/chat", data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(request, timeout=float(get_env("LLM_HTTP_TIMEOUT_SECONDS", "120"))) as response:
            return str(json.load(response).get("message", {}).get("content", ""))
