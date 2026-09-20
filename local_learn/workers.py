from __future__ import annotations

import threading
import time
from pathlib import Path

from config import LOCK_PATH, PID_PATH, TRAIN_AFTER_NEW_DOCS
from database import db
from downloader import process_queue_item
from ingestion_watcher import start_watcher, stop_watcher
from logging_setup import get_logger
from training_manager import run_training, should_autostart
from util import FileLock

log = get_logger("workers")

_stop = threading.Event()
_lock = FileLock(LOCK_PATH)


def download_loop() -> None:
    while not _stop.wait(2):
        try:
            if not process_queue_item():
                time.sleep(1)
        except Exception:
            log.exception("download loop")
            db.event("error", "download loop crash recovered")


def policy_loop() -> None:
    while not _stop.wait(60):
        try:
            ok, reason = should_autostart()
            if ok:
                log.info("autostart training: %s", reason)
                run_training(resume=True)
            else:
                log.debug("no train: %s", reason)
        except Exception:
            log.exception("policy loop")


def start_all() -> bool:
    if not _lock.acquire(False):
        log.error("workers already running")
        return False
    _stop.clear()
    PID_PATH.write_text(str(__import__("os").getpid()))
    start_watcher()
    threading.Thread(target=download_loop, name="dl", daemon=True).start()
    threading.Thread(target=policy_loop, name="policy", daemon=True).start()
    log.info("workers up")
    return True


def stop_all() -> None:
    _stop.set()
    stop_watcher()
    _lock.release()
    PID_PATH.unlink(missing_ok=True)
    log.info("workers down")


def running() -> bool:
    probe = FileLock(LOCK_PATH)
    got = probe.acquire(False)
    if got:
        probe.release()
        return False
    return True
