"""Minimal config helpers for ha_llm_control LLM clients."""

from __future__ import annotations

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / "llm_api" / ".env"


def load_env(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_env(name: str, default: str = "") -> str:
    load_env()
    return os.environ.get(name, default).strip()


def get_llm_temperature() -> float:
    raw = get_env("LLM_TEMPERATURE", "0")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def get_llm_provider() -> str:
    return get_env("LLM_PROVIDER", "claude")


def get_anthropic_api_key() -> str:
    return get_env("ANTHROPIC_API_KEY")


def get_claude_model() -> str:
    return get_env("CLAUDE_MODEL", "claude-sonnet-4-20250514")


def get_openai_api_key() -> str:
    return get_env("OPENAI_API_KEY")


def get_openai_model() -> str:
    return get_env("OPENAI_MODEL", "gpt-4o")


def get_google_api_key() -> str:
    return get_env("GOOGLE_API_KEY")


def get_gemini_model() -> str:
    return get_env("GEMINI_MODEL", "gemini-2.0-flash-exp")


def get_xai_api_key() -> str:
    return get_env("XAI_API_KEY")


def get_grok_api_key() -> str:
    return get_xai_api_key()


def get_grok_model() -> str:
    return get_env("GROK_MODEL", "grok-beta")
