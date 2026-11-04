"""Provider-neutral client loading for the public SmartBlock-LLM runtime.

The runtime ships without API keys or a model SDK. A deployment selects its
own client factory with ``SMARTBLOCK_LLM_CLIENT_FACTORY`` using
``package.module:function`` notation. The function receives an optional
provider ID and returns an object with ``generate_text`` plus an optional
``model`` or ``model_name`` attribute.
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
import os
from pathlib import Path
from time import perf_counter
from typing import Any, Callable


PROVIDER_ALIASES = {
    "ollama": "ollama", "claude": "claude", "chatgpt": "chatgpt",
    "openai": "chatgpt", "gpt": "chatgpt", "gemini": "gemini",
    "google": "gemini", "grok": "grok", "xai": "grok",
}
PUBLIC_PROVIDERS = (
    ("chatgpt", "ChatGPT", "OPENAI_API_KEY"),
    ("claude", "Claude", "ANTHROPIC_API_KEY"),
    ("gemini", "Gemini", "GOOGLE_API_KEY"),
    ("grok", "Grok", "XAI_API_KEY"),
    ("ollama", "Ollama (local)", None),
)


class ProviderError(RuntimeError):
    """A public-safe provider failure without SDK or credential details."""


@dataclass(frozen=True)
class ProviderReply:
    provider: str
    model: str
    text: str
    latency_ms: float


def _load_project_env() -> None:
    """Read only simple unset values from the project .env, if it exists."""
    env_file = Path(os.environ.get("SMARTBLOCK_LLM_ENV_FILE", ".env"))
    if not env_file.is_file():
        return
    try:
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip('"').strip("'")
    except OSError:
        return


def normalize_provider(provider: str | None) -> str | None:
    value = str(provider or "").strip().lower()
    if not value:
        return None
    if value not in PROVIDER_ALIASES:
        allowed = ", ".join(sorted({"claude", "chatgpt", "gemini", "grok", "ollama"}))
        raise ProviderError(f"Unsupported provider. Choose one of: {allowed}.")
    return PROVIDER_ALIASES[value]


def public_provider_catalog(read_env: Callable[[str, str], str] | None = None) -> dict[str, Any]:
    """Expose configuration state without returning credential values."""
    _load_project_env()
    if read_env is None:
        read_env = os.getenv
    default_provider = normalize_provider(read_env("LLM_PROVIDER", "ollama")) or "chatgpt"
    factory_configured = bool(read_env("SMARTBLOCK_LLM_CLIENT_FACTORY", ""))
    return {
        "providers": [
            {
                "id": provider_id,
                "label": label,
                "configured": factory_configured and (bool(read_env(key, "")) if key else True),
            }
            for provider_id, label, key in PUBLIC_PROVIDERS
        ],
        "default_provider": default_provider,
    }


def bounded_max_tokens(value: Any, default: int = 2000) -> int:
    try:
        requested = int(value)
    except (TypeError, ValueError):
        requested = default
    return max(256, min(requested, 4096))


def _model_name(client: Any) -> str:
    return str(getattr(client, "model", None) or getattr(client, "model_name", None) or "configured-default")


def configured_client_factory(provider: str | None) -> Any:
    """Load a deployment-owned provider adapter without importing private code."""
    _load_project_env()
    spec = str(os.environ.get("SMARTBLOCK_LLM_CLIENT_FACTORY") or "").strip()
    if not spec or ":" not in spec:
        raise ProviderError("No provider adapter is configured.")
    module_name, function_name = spec.rsplit(":", 1)
    try:
        factory = getattr(import_module(module_name), function_name)
    except (ImportError, AttributeError, ValueError) as exc:
        raise ProviderError("The configured provider adapter could not be loaded.") from exc
    if not callable(factory):
        raise ProviderError("The configured provider adapter is not callable.")
    return factory(provider)


def request_text(*, provider: str | None, prompt: str, system_prompt: str,
                 max_tokens: int, client_factory: Callable[[str | None], Any]) -> ProviderReply:
    normalized = normalize_provider(provider)
    started = perf_counter()
    try:
        client = client_factory(normalized)
        response = client.generate_text(prompt=prompt, system_prompt=system_prompt,
                                        max_tokens=bounded_max_tokens(max_tokens))
    except ProviderError:
        raise
    except Exception as exc:
        raise ProviderError(f"Provider request failed ({type(exc).__name__}).") from exc
    return ProviderReply(
        provider=normalized or "default", model=_model_name(client), text=str(response or ""),
        latency_ms=round((perf_counter() - started) * 1000, 2),
    )
