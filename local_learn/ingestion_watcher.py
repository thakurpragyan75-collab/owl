from __future__ import annotations

import threading
import time
from pathlib import Path

from cleaner import parse_file
from config import RAW_DIR
from database import db
from dataset_manager import append_corpus
from logging_setup import get_logger
from rag import index_document
from util import sha256_text, wait_stable

log = get_logger("watcher")

_stop = threading.Event()


def ingest_path(path: Path, source_url: str | None = None, download_id: int | None = None) -> bool:
    if path.suffix == ".part" or path.name.startswith("."):
        return False
    if not wait_stable(path):
        return False
    try:
        text, kind = parse_file(path)
    except Exception as e:
        log.warning("parse failed %s: %s", path.name, e)
        db.event("error", f"parse {path.name}: {e}")
        return False
    digest = sha256_text(text)
    doc_id = db.insert_document(
        download_id=download_id,
        source_url=source_url or str(path),
        content_sha256=digest,
        char_count=len(text),
        file_type=kind,
    )
    if doc_id is None:
        log.info("duplicate content %s", path.name)
        path.unlink(missing_ok=True)
        return True
    try:
        append_corpus(text)
        index_document(source_url or str(path), text)
    except Exception as e:
        log.exception("dataset append failed")
        db.event("error", f"append {path.name}: {e}")
        return False
    path.unlink(missing_ok=True)
    db.event("info", f"ingested {path.name} chars={len(text)}")
    return True


def scan_once() -> int:
    n = 0
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for p in sorted(RAW_DIR.iterdir()):
        if not p.is_file():
            continue
        if ingest_path(p):
            n += 1
    return n


def worker_loop() -> None:
    log.info("ingestion watcher started")
    try:
        from watchdog.events import FileSystemEventHandler
        from watchdog.observers import Observer

        class H(FileSystemEventHandler):
            def on_created(self, event):
                if event.is_directory:
                    return
                time.sleep(0.2)
                ingest_path(Path(event.src_path))

            def on_moved(self, event):
                if event.is_directory:
                    return
                ingest_path(Path(event.dest_path))

        obs = Observer()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        obs.schedule(H(), str(RAW_DIR), recursive=False)
        obs.start()
        scan_once()
        while not _stop.wait(5):
            scan_once()
        obs.stop()
        obs.join(timeout=5)
    except ImportError:
        log.warning("watchdog not installed; polling")
        while not _stop.wait(4):
            scan_once()


def start_watcher() -> threading.Thread:
    _stop.clear()
    t = threading.Thread(target=worker_loop, name="ingest", daemon=True)
    t.start()
    return t


def stop_watcher() -> None:
    _stop.set()
