from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from config import DB_PATH, STATE_DIR


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    added_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    retries INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    canonical_url TEXT,
    path TEXT,
    content_type TEXT,
    sha256 TEXT,
    byte_size INTEGER,
    downloaded_at TEXT,
    status TEXT NOT NULL,
    error TEXT,
    retries INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_id INTEGER,
    source_url TEXT,
    content_sha256 TEXT NOT NULL UNIQUE,
    char_count INTEGER,
    file_type TEXT,
    ingested_at TEXT,
    training_status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY(download_id) REFERENCES downloads(id)
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS training_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    result TEXT,
    checkpoint TEXT,
    log_tail TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
CREATE INDEX IF NOT EXISTS idx_doc_hash ON documents(content_sha256);
"""


class Database:
    def __init__(self, path: Path = DB_PATH):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        return con

    def _init(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with self._connect() as con:
            con.executescript(SCHEMA)
            cols = {r[1] for r in con.execute("PRAGMA table_info(documents)").fetchall()}
            if "ingest_status" not in cols:
                con.execute("ALTER TABLE documents ADD COLUMN ingest_status TEXT NOT NULL DEFAULT 'complete'")
            con.commit()

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        con = self._connect()
        try:
            yield con
            con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()

    def event(self, kind: str, message: str) -> None:
        with self.tx() as con:
            con.execute(
                "INSERT INTO events(at, kind, message) VALUES (?,?,?)",
                (utcnow(), kind, message[:4000]),
            )

    def enqueue(self, url: str) -> bool:
        with self.tx() as con:
            try:
                con.execute(
                    "INSERT INTO queue(url, added_at, status) VALUES (?,?, 'queued')",
                    (url, utcnow()),
                )
                return True
            except sqlite3.IntegrityError:
                return False

    def next_queued(self) -> sqlite3.Row | None:
        with self.tx() as con:
            row = con.execute(
                "SELECT * FROM queue WHERE status='queued' ORDER BY id LIMIT 1"
            ).fetchone()
            if not row:
                return None
            con.execute("UPDATE queue SET status='downloading' WHERE id=?", (row["id"],))
            return row

    def queue_fail(self, qid: int, error: str, retry: bool) -> None:
        with self.tx() as con:
            if retry:
                con.execute(
                    "UPDATE queue SET status='queued', retries=retries+1, last_error=? WHERE id=?",
                    (error[:1000], qid),
                )
            else:
                con.execute(
                    "UPDATE queue SET status='failed', last_error=? WHERE id=?",
                    (error[:1000], qid),
                )

    def queue_done(self, qid: int) -> None:
        with self.tx() as con:
            con.execute("UPDATE queue SET status='done' WHERE id=?", (qid,))

    def record_download(self, **kw: Any) -> int:
        cols = [
            "url",
            "canonical_url",
            "path",
            "content_type",
            "sha256",
            "byte_size",
            "downloaded_at",
            "status",
            "error",
            "retries",
        ]
        vals = [kw.get(c) for c in cols]
        if vals[cols.index("downloaded_at")] is None:
            vals[cols.index("downloaded_at")] = utcnow()
        if vals[cols.index("retries")] is None:
            vals[cols.index("retries")] = 0
        with self.tx() as con:
            cur = con.execute(
                f"INSERT INTO downloads({','.join(cols)}) VALUES ({','.join('?'*len(cols))})",
                vals,
            )
            return int(cur.lastrowid)

    def find_download_hash(self, sha: str) -> sqlite3.Row | None:
        with self._connect() as con:
            return con.execute("SELECT * FROM downloads WHERE sha256=? LIMIT 1", (sha,)).fetchone()

    def insert_document(self, **kw: Any) -> int | None:
        status = kw.get("ingest_status") or "parsed"
        with self.tx() as con:
            try:
                cur = con.execute(
                    """INSERT INTO documents(download_id, source_url, content_sha256, char_count, file_type, ingested_at, ingest_status, training_status)
                       VALUES (?,?,?,?,?,?,?, 'pending')""",
                    (
                        kw.get("download_id"),
                        kw.get("source_url"),
                        kw["content_sha256"],
                        kw.get("char_count"),
                        kw.get("file_type"),
                        utcnow(),
                        status,
                    ),
                )
                return int(cur.lastrowid)
            except sqlite3.IntegrityError:
                row = con.execute(
                    "SELECT id, ingest_status FROM documents WHERE content_sha256=?",
                    (kw["content_sha256"],),
                ).fetchone()
                if row and row["ingest_status"] != "complete":
                    return int(row["id"])
                return None

    def set_ingest_status(self, doc_id: int, status: str) -> None:
        with self.tx() as con:
            con.execute("UPDATE documents SET ingest_status=? WHERE id=?", (status, doc_id))

    def incomplete_docs(self) -> list[sqlite3.Row]:
        with self._connect() as con:
            return list(con.execute("SELECT * FROM documents WHERE ingest_status != 'complete'"))

    def pending_training_count(self) -> int:
        with self._connect() as con:
            return int(con.execute("SELECT COUNT(*) FROM documents WHERE training_status='pending'").fetchone()[0])

    def mark_docs_trained(self) -> None:
        with self.tx() as con:
            con.execute("UPDATE documents SET training_status='trained' WHERE training_status='pending'")

    def stats(self) -> dict[str, Any]:
        with self._connect() as con:
            q = lambda sql: con.execute(sql).fetchone()[0]
            latest_ing = con.execute("SELECT ingested_at FROM documents ORDER BY id DESC LIMIT 1").fetchone()
            latest_tr = con.execute("SELECT started_at, result, checkpoint FROM training_runs ORDER BY id DESC LIMIT 1").fetchone()
            return {
                "queued": q("SELECT COUNT(*) FROM queue WHERE status='queued'"),
                "downloading": q("SELECT COUNT(*) FROM queue WHERE status='downloading'"),
                "downloads_ok": q("SELECT COUNT(*) FROM downloads WHERE status='ok'"),
                "downloads_failed": q("SELECT COUNT(*) FROM downloads WHERE status='failed'"),
                "documents": q("SELECT COUNT(*) FROM documents"),
                "pending_train": q("SELECT COUNT(*) FROM documents WHERE training_status='pending'"),
                "latest_ingestion": latest_ing[0] if latest_ing else None,
                "latest_training": dict(latest_tr) if latest_tr else None,
            }

    def errors(self, n: int = 30) -> list[sqlite3.Row]:
        with self._connect() as con:
            return list(con.execute("SELECT * FROM events WHERE kind='error' ORDER BY id DESC LIMIT ?", (n,)))

    def queue_rows(self) -> list[sqlite3.Row]:
        with self._connect() as con:
            return list(con.execute("SELECT * FROM queue ORDER BY id DESC LIMIT 100"))

    def history(self, n: int = 50) -> list[sqlite3.Row]:
        with self._connect() as con:
            return list(con.execute("SELECT * FROM downloads ORDER BY id DESC LIMIT ?", (n,)))

    def start_training(self) -> int:
        with self.tx() as con:
            cur = con.execute(
                "INSERT INTO training_runs(started_at, result) VALUES (?, 'running')",
                (utcnow(),),
            )
            return int(cur.lastrowid)

    def finish_training(self, run_id: int, result: str, checkpoint: str | None, log_tail: str) -> None:
        with self.tx() as con:
            con.execute(
                "UPDATE training_runs SET finished_at=?, result=?, checkpoint=?, log_tail=? WHERE id=?",
                (utcnow(), result, checkpoint, log_tail[-4000:], run_id),
            )

    def latest_checkpoint(self) -> str | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT checkpoint FROM training_runs WHERE result='ok' AND checkpoint IS NOT NULL ORDER BY id DESC LIMIT 1"
            ).fetchone()
            return row[0] if row else None


db = Database()
