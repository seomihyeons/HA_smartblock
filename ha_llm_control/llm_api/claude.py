"""Anthropic Claude 클라이언트 구현체."""
from typing import Optional
import anthropic
try:
    from ..modules.core.config import get_anthropic_api_key, get_claude_model, get_llm_temperature
    from ..modules.core.metrics import get_metrics_tracker
except ImportError:  # Supports the legacy top-level llm_api import path.
    from modules.core.config import get_anthropic_api_key, get_claude_model, get_llm_temperature
    from modules.core.metrics import get_metrics_tracker
from .base import LLMClient


class ClaudeClient(LLMClient):
    """Claude API 클라이언트."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=get_anthropic_api_key())
        self.model = get_claude_model()

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, max_tokens: int = 4096) -> str:
        """Claude를 사용하여 텍스트 생성.

        Usage:
            공격 시나리오 생성, 명령어 수정 등 LLM의 추론 능력이 필요한 모든 곳에서 사용됩니다.

        Args:
            prompt: 사용자 프롬프트.
            system_prompt: 시스템 프롬프트.
            max_tokens: 최대 생성 토큰 수.

        Returns:
            str: 생성된 응답 텍스트.
        """
        messages = [{"role": "user", "content": prompt}]

        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": get_llm_temperature(),
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        response = self.client.messages.create(**kwargs)

        # 메트릭 추적
        tracker = get_metrics_tracker()
        if tracker and hasattr(response, 'usage'):
            tracker.record_llm_call(
                model=self.model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens
            )

        return response.content[0].text
