from __future__ import annotations

from logging_setup import get_logger
from config import CHAT_MAX_TOKENS, MLX_MODEL, ACTIVE_ADAPTER
from .provider import ChatMessage

log = get_logger("llm.mlx")


class MlxProvider:
    name = "mlx"
    model_id = MLX_MODEL

    def __init__(self) -> None:
        self.loaded = False
        self._model = None
        self._tok = None
        self.error = "not loaded"
        try:
            from mlx_lm import load, generate

            self._generate = generate
            adapter = None
            if ACTIVE_ADAPTER.exists():
                import json

                info = json.loads(ACTIVE_ADAPTER.read_text())
                adapter = info.get("path")
            self._model, self._tok = load(MLX_MODEL, adapter_path=adapter)
            self.loaded = True
            self.error = ""
            log.info("MLX loaded %s adapter=%s", MLX_MODEL, adapter)
        except Exception as e:
            self.error = str(e)
            log.warning("MLX unavailable: %s", e)

    def health(self) -> dict:
        return {
            "engine": self.name,
            "model": self.model_id,
            "loaded": self.loaded,
            "error": self.error or None,
        }

    def chat(self, messages: list[ChatMessage], *, max_tokens: int = CHAT_MAX_TOKENS, temperature: float = 0.6) -> str:
        if not self.loaded:
            raise RuntimeError(f"MLX not loaded: {self.error}")
        prompt = self._tok.apply_chat_template(
            [{"role": m.role, "content": m.content} for m in messages],
            tokenize=False,
            add_generation_prompt=True,
        )
        out = self._generate(
            self._model,
            self._tok,
            prompt=prompt,
            max_tokens=max_tokens,
            verbose=False,
        )
        if isinstance(out, str) and out.startswith(prompt):
            return out[len(prompt) :].strip()
        return str(out).strip()
