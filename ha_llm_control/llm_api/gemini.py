"""Google Gemini 클라이언트 구현체."""
from typing import Optional
import google.generativeai as genai
try:
    from ..modules.core.config import get_gemini_model, get_google_api_key, get_llm_temperature
    from ..modules.core.metrics import get_metrics_tracker
except ImportError:  # Supports the legacy top-level llm_api import path.
    from modules.core.config import get_gemini_model, get_google_api_key, get_llm_temperature
    from modules.core.metrics import get_metrics_tracker
from .base import LLMClient


class GeminiClient(LLMClient):
    """Gemini API 클라이언트."""

    def __init__(self):
        genai.configure(api_key=get_google_api_key())
        self.model_name = get_gemini_model()
        self.model = genai.GenerativeModel(self.model_name)

    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, max_tokens: int = 65536) -> str:
        max_tokens = 65536
        """Gemini를 사용하여 텍스트 생성.

        Usage:
            공격 시나리오 생성, 명령어 수정 등 LLM의 추론 능력이 필요한 모든 곳에서 사용됩니다.

        Args:
            prompt: 사용자 프롬프트.
            system_prompt: 시스템 프롬프트.
            max_tokens: 최대 생성 토큰 수.

        Returns:
            str: 생성된 응답 텍스트.
        """
        generation_config = genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=get_llm_temperature()
        )

        # System prompt가 있으면 user prompt 앞에 추가
        full_prompt = prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n{prompt}"

        response = self.model.generate_content(
            full_prompt,
            generation_config=generation_config
        )

        # 메트릭 추적
        tracker = get_metrics_tracker()
        if tracker and hasattr(response, 'usage_metadata'):
            tracker.record_llm_call(
                model=self.model_name,
                input_tokens=response.usage_metadata.prompt_token_count,
                output_tokens=response.usage_metadata.candidates_token_count
            )

        return response.text
