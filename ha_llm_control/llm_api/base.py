"""LLM 클라이언트 추상 기본 클래스."""
from abc import ABC, abstractmethod
from typing import Optional


class LLMClient(ABC):
    """LLM 클라이언트 인터페이스."""

    @abstractmethod
    def generate_text(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """텍스트 생성.

        Args:
            prompt: 사용자 프롬프트.
            system_prompt: 시스템 프롬프트 (선택).

        Returns:
            str: 생성된 텍스트.
        """
        pass
