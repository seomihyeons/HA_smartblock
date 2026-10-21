"""xAI Grok 클라이언트 구현체."""
from typing import Optional
import openai
try:
    from ..modules.core.config import get_grok_api_key, get_grok_model, get_llm_temperature
    from ..modules.core.metrics import get_metrics_tracker
except ImportError:  # Supports the legacy top-level llm_api import path.
    from modules.core.config import get_grok_api_key, get_grok_model, get_llm_temperature
    from modules.core.metrics import get_metrics_tracker
from .base import LLMClient


class GrokClient(LLMClient):
    """Grok API 클라이언트."""

    def __init__(self):
        self.client = openai.OpenAI(
            api_key=get_grok_api_key(),
            base_url="https://api.x.ai/v1"
        )
        self.model = get_grok_model()

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, max_tokens: int = 4096) -> str:
        """Grok을 사용하여 텍스트 생성.

        Usage:
            공격 시나리오 생성, 명령어 수정 등 LLM의 추론 능력이 필요한 모든 곳에서 사용됩니다.

        Args:
            prompt: 사용자 프롬프트.
            system_prompt: 시스템 프롬프트.
            max_tokens: 최대 생성 토큰 수.

        Returns:
            str: 생성된 응답 텍스트.
        """
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        messages.append({"role": "user", "content": prompt})
        temperature = get_llm_temperature()

        # Grok 모델도 OpenAI SDK를 사용하므로 최신 API 규격 적용
        # grok-beta, grok-2 등 최신 모델은 max_completion_tokens 사용 가능성 고려
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
        except Exception as e:
            # max_tokens 오류 시 max_completion_tokens로 재시도
            if 'max_tokens' in str(e) and 'max_completion_tokens' in str(e):
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_completion_tokens=max_tokens,
                    temperature=temperature
                )
            else:
                raise

        # 메트릭 추적
        tracker = get_metrics_tracker()
        if tracker and hasattr(response, 'usage'):
            tracker.record_llm_call(
                model=self.model,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens
            )

        return response.choices[0].message.content
