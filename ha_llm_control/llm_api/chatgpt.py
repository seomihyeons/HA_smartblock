"""OpenAI ChatGPT 클라이언트 구현체."""
from typing import Optional
import openai
try:
    from ..modules.core.config import get_llm_temperature, get_openai_api_key, get_openai_model
    from ..modules.core.metrics import get_metrics_tracker
except ImportError:  # Supports the legacy top-level llm_api import path.
    from modules.core.config import get_llm_temperature, get_openai_api_key, get_openai_model
    from modules.core.metrics import get_metrics_tracker
from .base import LLMClient


class ChatGPTClient(LLMClient):
    """ChatGPT API 클라이언트."""

    def __init__(self):
        self.client = openai.OpenAI(api_key=get_openai_api_key())
        self.model = get_openai_model()

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, max_tokens: int = 4096) -> str:
        """ChatGPT를 사용하여 텍스트 생성.

        Usage:
            공격 시나리오 생성, 명령어 수정 등 LLM의 추론 능력이 필요한 모든 곳에서 사용됩니다.

        Args:
            prompt: 사용자 프롬프트.
            system_prompt: 시스템 프롬프트.
            max_tokens: 최대 생성 토큰 수 (최대 4096, OpenAI 제한).

        Returns:
            str: 생성된 응답 텍스트.
        """
        temperature = get_llm_temperature()

        # OpenAI API는 max_tokens를 4096으로 제한
        max_tokens = min(max_tokens, 4096)

        # o1 모델은 system prompt를 지원하지 않음
        is_reasoning_model = self.model.startswith('o1')

        messages = []

        if is_reasoning_model:
            # o1 모델: system prompt를 user 메시지에 통합
            if system_prompt:
                combined_prompt = f"{system_prompt}\n\n{prompt}"
                messages.append({"role": "user", "content": combined_prompt})
            else:
                messages.append({"role": "user", "content": prompt})
        else:
            # 일반 모델: system prompt 지원
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

        # 최신 모델은 max_completion_tokens 사용, 구 모델은 max_tokens 사용
        # - max_completion_tokens: o1, gpt-4o, gpt-5 시리즈 등
        # - max_tokens: gpt-3.5-turbo, gpt-4, gpt-4-turbo 등
        use_completion_tokens = (
            self.model.startswith('o1') or
            self.model.startswith('gpt-4o') or
            self.model.startswith('gpt-5')
        )

        if use_completion_tokens:
            if is_reasoning_model:
                # o1 모델: temperature 제외
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_completion_tokens=max_tokens
                )
            else:
                # gpt-4o, gpt-5 등: temperature 포함
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_completion_tokens=max_tokens,
                    temperature=temperature
                )
        else:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )

        # 메트릭 추적
        tracker = get_metrics_tracker()
        if tracker and hasattr(response, 'usage'):
            tracker.record_llm_call(
                model=self.model,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens
            )

        return response.choices[0].message.content
