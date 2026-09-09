"""Safe, provider-neutral wrapper around the existing llm_api clients."""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any, Callable


PROVIDER_ALIASES = {
    "claude": "claude",
    "chatgpt": "chatgpt",
    "openai": "chatgpt",
    "gpt": "chatgpt",
    "gemini": "gemini",
    "google": "gemini",
    "grok": "grok",
    "xai": "grok",
}

PUBLIC_PROVIDERS = (
    ("chatgpt", "ChatGPT", "OPENAI_API_KEY"),
    ("claude", "Claude", "ANTHROPIC_API_KEY"),
    ("gemini", "Gemini", "GOOGLE_API_KEY"),
    ("grok", "Grok", "XAI_API_KEY"),
)


class ProviderError(RuntimeError):
    """A public-safe provider failure without SDK or credential details."""


@dataclass(frozen=True)
class ProviderReply:
    provider: str
    model: str
    text: str
    latency_ms: float


def normalize_provider(provider: str | None) -> str | None:
    value = str(provider or "").strip().lower()
    if not value:
        return None
    if value not in PROVIDER_ALIASES:
        allowed = ", ".join(sorted({"claude", "chatgpt", "gemini", "grok"}))
        raise ProviderError(f"Unsupported provider. Choose one of: {allowed}.")
    return PROVIDER_ALIASES[value]


def public_provider_catalog(read_env: Callable[[str, str], str] | None = None) -> dict[str, Any]:
    """Expose provider setup state without exposing credential values."""
    if read_env is None:
        from ha_llm_control.modules.core.config import get_env
        read_env = get_env
    default_provider = normalize_provider(read_env("LLM_PROVIDER", "chatgpt")) or "chatgpt"
    return {
        "providers": [
            {"id": provider_id, "label": label, "configured": bool(read_env(key, ""))}
            for provider_id, label, key in PUBLIC_PROVIDERS
        ],
        "default_provider": default_provider,
    }


def bounded_max_tokens(value: Any, default: int = 1200) -> int:
    try:
        requested = int(value)
    except (TypeError, ValueError):
        requested = default
    return max(256, min(requested, 4096))


def _model_name(client: Any) -> str:
    return str(getattr(client, "model", None) or getattr(client, "model_name", None) or "configured-default")


def request_text(
    *,
    provider: str | None,
    prompt: str,
    system_prompt: str,
    max_tokens: int,
    client_factory: Callable[[str | None], Any],
) -> ProviderReply:
    normalized = normalize_provider(provider)
    started = perf_counter()
    try:
        client = client_factory(normalized)
        response = client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=bounded_max_tokens(max_tokens),
        )
    except ProviderError:
        raise
    except Exception as exc:
        # Do not send SDK exception text to a browser because it can include request details.
        raise ProviderError(f"Provider request failed ({type(exc).__name__}).") from exc
    return ProviderReply(
        provider=normalized or "default",
        model=_model_name(client),
        text=str(response or ""),
        latency_ms=round((perf_counter() - started) * 1000, 2),
    )
