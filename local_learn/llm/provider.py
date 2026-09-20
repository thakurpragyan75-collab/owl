from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ChatMessage:
    role: str
    content: str


class LLMProvider(Protocol):
    name: str
    model_id: str
    loaded: bool

    def health(self) -> dict: ...
    def chat(self, messages: list[ChatMessage], *, max_tokens: int = 256, temperature: float = 0.6) -> str: ...


def load_provider() -> LLMProvider:
    from config import MODEL_ENGINE

    engine = (MODEL_ENGINE or "mlx").lower()
    if engine == "stub":
        from .stub_provider import StubProvider

        return StubProvider()
    if engine == "mlx":
        try:
            from .mlx_provider import MlxProvider

            p = MlxProvider()
            if p.loaded:
                return p
        except Exception:
            pass
        from .llama_cpp_provider import LlamaCppProvider

        cpp = LlamaCppProvider()
        if cpp.loaded:
            return cpp
        return MlxProvider()  # unloaded; health explains
    if engine in {"llamacpp", "llama.cpp", "gguf"}:
        from .llama_cpp_provider import LlamaCppProvider

        return LlamaCppProvider()
    if engine == "stub":
        from .stub_provider import StubProvider

        return StubProvider()
    raise RuntimeError(f"unknown MODEL_ENGINE={engine}")
