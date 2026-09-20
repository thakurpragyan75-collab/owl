"""Test-only provider. Never selected unless MODEL_ENGINE=stub."""

from __future__ import annotations

from .provider import ChatMessage


class StubProvider:
    name = "stub"
    model_id = "stub-local"
    loaded = True

    def health(self) -> dict:
        return {"engine": self.name, "model": self.model_id, "loaded": True, "error": None}

    def chat(self, messages: list[ChatMessage], *, max_tokens: int = 64, temperature: float = 0.0) -> str:
        user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        if "recursion" in user.lower():
            return "Recursion is a function calling itself with a smaller case until a base case stops it."
        if user.lower().startswith("hey") or user.lower().startswith("hello"):
            return "Hey. Local roost is awake. No cloud mind in this path."
        return f"Local stub heard: {user[:180]}"
