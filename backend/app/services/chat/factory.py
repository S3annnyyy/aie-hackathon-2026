from __future__ import annotations

from app.core.config import Settings
from app.services.chat.llm_backend import LlmBackend


def build_llm_backend(settings: Settings) -> LlmBackend:
    provider = (settings.chat_llm_provider or 'openai').lower()

    if provider == 'anthropic':
        if not settings.anthropic_api_key:
            raise RuntimeError('CHAT_LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.')
        from app.services.chat.anthropic_backend import AnthropicBackend

        return AnthropicBackend(
            api_key=settings.anthropic_api_key,
            model=settings.anthropic_model,
        )

    if provider == 'gemini':
        if not settings.gemini_api_key:
            raise RuntimeError('CHAT_LLM_PROVIDER=gemini but GEMINI_API_KEY is not set.')
        from app.services.chat.gemini_backend import GeminiBackend

        return GeminiBackend(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
        )

    if provider == 'openai':
        if not settings.openai_api_key:
            raise RuntimeError('CHAT_LLM_PROVIDER=openai but OPENAI_API_KEY is not set.')
        from app.services.chat.openai_backend import OpenAIBackend

        return OpenAIBackend(
            api_key=settings.openai_api_key,
            model=settings.chat_openai_model or settings.openai_model,
        )

    raise RuntimeError(f'Unknown CHAT_LLM_PROVIDER: {provider!r}. Use "gemini", "openai", or "anthropic".')
