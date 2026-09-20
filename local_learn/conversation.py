from __future__ import annotations

from llm.provider import ChatMessage, LLMProvider
from logging_setup import get_logger
from rag import context_for, looks_like_knowledge, search as rag_search

log = get_logger("conversation")

OWL_SYSTEM = """You are OWL, a local personal companion running on this machine.
You do not call cloud AI. If you lack knowledge, say so. Never invent a source URL.
Keep ordinary talk to 1–4 sentences unless asked for depth.
No emoji."""


def build_messages(
    *,
    prompt: str,
    history: list[dict],
    boss_name: str,
    personality: str,
    notes: list[str],
    people: list[dict],
    city: str = "",
    favorite_song: str = "",
    mode: str = "talk",
) -> list[ChatMessage]:
    tone = {
        "tease": "Dry, teasing, still useful.",
        "precise": "Precise, short, Jarvis-like.",
    }.get(personality, "Warm partner, calm, slightly teasing.")
    people_s = ", ".join(f"{p.get('name')} ({p.get('relation')})" for p in people) or "none"
    notes_s = " | ".join(notes[-8:]) or "none"
    extra = ""
    if mode == "math":
        extra = " Solve step by step. End with Result: ..."
    elif mode == "research":
        extra = " You have no live web. Use only nest notes and retrieved local documents. If nothing was retrieved, say you need a URL ingested."
    elif mode == "news":
        extra = " You have no live wire. Do not invent today's headlines."

    rag = ""
    if looks_like_knowledge(prompt) or mode == "research":
        rag = context_for(prompt, k=4)
    elif len(prompt) > 40:
        # light retrieval; omit if nothing matches
        hits = rag_search(prompt, k=2)
        if hits:
            rag = context_for(prompt, k=2)

    sys = (
        f"{OWL_SYSTEM}\nAddress the user as {boss_name}. {tone}{extra}\n"
        f"City: {city or 'unknown'}. Song: {favorite_song or 'Night Watch'}.\n"
        f"People: {people_s}\nNotes: {notes_s}\n"
    )
    if rag:
        sys += (
            "\nLocal knowledge (cite only these sources; if empty of an answer, say you do not have it locally):\n"
            + rag[:6000]
        )

    msgs = [ChatMessage(role="system", content=sys)]
    for h in history[-8:]:
        role = "assistant" if h.get("role") in {"owl", "assistant"} else "user"
        msgs.append(ChatMessage(role=role, content=str(h.get("text") or h.get("content") or "")[:2000]))
    msgs.append(ChatMessage(role="user", content=prompt[:6000]))
    return msgs


def converse(provider: LLMProvider, **kwargs) -> dict:
    if not provider.loaded:
        return {"ok": False, "error": f"Local mind is not loaded ({provider.health().get('error')}).", "engine": provider.name}
    msgs = build_messages(**kwargs)
    text = provider.chat(msgs)
    provenance = []
    if looks_like_knowledge(kwargs.get("prompt", "")):
        provenance = rag_search(kwargs.get("prompt", ""), k=3)
    return {
        "ok": True,
        "text": text,
        "engine": provider.name,
        "model": provider.model_id,
        "sources": [
            {"source": p.get("source"), "hash": p.get("doc_hash"), "chunk": p.get("chunk_index")}
            for p in provenance
        ],
    }
