from __future__ import annotations

from pathlib import Path

from config import CHAT_CTX, CHAT_MAX_TOKENS, LLAMA_CPP_MODEL
from logging_setup import get_logger
from .provider import ChatMessage

log = get_logger("llm.gguf")


class LlamaCppProvider:
    name = "llamacpp"
    model_id = LLAMA_CPP_MODEL

    def __init__(self) -> None:
        self.loaded = False
        self._llm = None
        self.error = "not loaded"
        path = Path(LLAMA_CPP_MODEL)
        if not path.exists():
            self.error = f"GGUF missing: {path}"
            log.warning(self.error)
            return
        try:
            from llama_cpp import Llama

            self._llm = Llama(
                model_path=str(path),
                n_ctx=min(CHAT_CTX, 2048),
                n_threads=2,
                n_gpu_layers=0,
                n_batch=128,
                verbose=False,
            )
            self.loaded = True
            self.error = ""
            log.info("llama.cpp loaded %s", path.name)
        except Exception as e:
            self.error = str(e)
            log.warning("llama.cpp failed: %s", e)

    def health(self) -> dict:
        return {
            "engine": self.name,
            "model": Path(self.model_id).name,
            "loaded": self.loaded,
            "error": self.error or None,
        }

    def chat(self, messages: list[ChatMessage], *, max_tokens: int = CHAT_MAX_TOKENS, temperature: float = 0.6) -> str:
        if not self.loaded or self._llm is None:
            raise RuntimeError(f"local GGUF not loaded: {self.error}")
        payload = [{"role": m.role, "content": m.content} for m in messages]
        out = self._llm.create_chat_completion(
            messages=payload,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return (out["choices"][0]["message"]["content"] or "").strip()
