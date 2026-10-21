"""No-op metrics tracker used by the local LLM clients."""

from __future__ import annotations


class MetricsTracker:
    def record_llm_call(self, model: str, input_tokens: int, output_tokens: int) -> None:
        return None


_TRACKER = MetricsTracker()


def get_metrics_tracker() -> MetricsTracker:
    return _TRACKER
