"""Fully local retrieval via SQLite FTS5. No cloud embeddings."""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import RAG_DB, STATE_DIR
from logging_setup import get_logger

log = get_logger("rag")

FTS_STRIP = re.compile(r"[^\w\s]+", re.UNICODE)


def _con() -> sqlite3.Connection:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(RAG_DB)
    con.row_factory = sqlite3.Row
    con.execute(
        """CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_hash TEXT,
            source TEXT,
            canonical_url TEXT,
            ingested_at TEXT,
            chunk_index INTEGER,
            body TEXT
        )"""
    )
    con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(body, content='chunks', content_rowid='id')")
    con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_hash_i ON chunks(doc_hash, chunk_index)")
    return con


def _chunk(text: str, size: int = 700, overlap: int = 80) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 2 <= size:
            buf = f"{buf}\n\n{p}".strip()
        else:
            if buf:
                chunks.append(buf)
            if len(p) <= size:
                buf = p
            else:
                i = 0
                while i < len(p):
                    chunks.append(p[i : i + size])
                    i += size - overlap
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks or ([text[:size]] if text.strip() else [])


def index_document(
    source: str,
    text: str,
    *,
    doc_hash: str | None = None,
    canonical_url: str | None = None,
    chunk_size: int = 700,
) -> int:
    parts = _chunk(text, chunk_size)
    now = datetime.now(timezone.utc).isoformat()
    n = 0
    with _con() as con:
        if doc_hash:
            existing = con.execute("SELECT id FROM chunks WHERE doc_hash=?", (doc_hash,)).fetchall()
            if existing:
                return 0
        for i, body in enumerate(parts):
            cur = con.execute(
                "INSERT INTO chunks(doc_hash, source, canonical_url, ingested_at, chunk_index, body) VALUES (?,?,?,?,?,?)",
                (doc_hash, source, canonical_url or source, now, i, body),
            )
            rid = cur.lastrowid
            con.execute("INSERT INTO chunks_fts(rowid, body) VALUES (?, ?)", (rid, body))
            n += 1
        con.commit()
    return n


def _fts_query(query: str) -> str:
    words = [w for w in FTS_STRIP.sub(" ", query).split() if len(w) > 1][:12]
    if not words:
        return ""
    if len(words) >= 2:
        phrase = " ".join(words[:6])
        ors = " OR ".join(words)
        return f"\"{phrase}\" OR ({ors})"
    return words[0]


def search(query: str, k: int = 5) -> list[dict]:
    q = _fts_query(query)
    if not q:
        return []
    with _con() as con:
        try:
            rows = con.execute(
                """SELECT c.id, c.doc_hash, c.source, c.canonical_url, c.ingested_at, c.chunk_index, c.body
                   FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
                   WHERE chunks_fts MATCH ? LIMIT ?""",
                (q, k),
            ).fetchall()
        except sqlite3.OperationalError:
            rows = []
    return [
        {
            "id": r["id"],
            "doc_hash": r["doc_hash"],
            "source": r["source"],
            "canonical_url": r["canonical_url"],
            "ingested_at": r["ingested_at"],
            "chunk_index": r["chunk_index"],
            "body": r["body"],
        }
        for r in rows
    ]


def context_for(query: str, k: int = 4) -> str:
    hits = search(query, k)
    if not hits:
        return ""
    blocks = []
    for h in hits:
        blocks.append(f"[source={h['source']} hash={h['doc_hash']} chunk={h['chunk_index']}]\n{h['body']}")
    return "\n\n".join(blocks)


def looks_like_knowledge(query: str) -> bool:
    q = query.lower()
    return bool(
        re.search(
            r"\b(what did i|what have i|summarize the|collected about|saved about|from the paper|where did this|my documents|local knowledge|i downloaded)\b",
            q,
        )
    )
