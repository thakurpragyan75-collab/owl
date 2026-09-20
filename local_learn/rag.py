"""Fully local retrieval via SQLite FTS5. No cloud embeddings."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from config import RAG_DB, STATE_DIR
from logging_setup import get_logger

log = get_logger("rag")


def _con() -> sqlite3.Connection:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(RAG_DB)
    con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(source, body)")
    return con


def index_document(source: str, text: str, chunk_size: int = 800) -> None:
    chunks = []
    buf = text.strip()
    while buf:
        chunks.append(buf[:chunk_size])
        buf = buf[chunk_size - 80 :]
        if len(buf) < 80:
            if buf:
                chunks.append(buf)
            break
    with _con() as con:
        for c in chunks:
            con.execute("INSERT INTO chunks(source, body) VALUES (?, ?)", (source, c))
        con.commit()


def search(query: str, k: int = 5) -> list[tuple[str, str]]:
    q = query.replace('"', " ").strip()
    if not q:
        return []
    with _con() as con:
        try:
            rows = con.execute(
                "SELECT source, body FROM chunks WHERE chunks MATCH ? LIMIT ?",
                (q, k),
            ).fetchall()
        except sqlite3.OperationalError:
            rows = []
    return [(r[0], r[1]) for r in rows]


def context_for(query: str, k: int = 4) -> str:
    hits = search(query, k)
    if not hits:
        return ""
    return "\n\n".join(f"[{src}]\n{body}" for src, body in hits)
