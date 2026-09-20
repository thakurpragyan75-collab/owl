#!/usr/bin/env python3
"""Local autonomous ingestion + MLX LoRA controller. No cloud inference."""

from __future__ import annotations

import argparse
import signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from config import DATASET_JSONL, MLX_MODEL, ROOT as PROJ  # noqa: E402
from database import db  # noqa: E402
from dataset_manager import corpus_stats, rebuild_splits  # noqa: E402
from health import health  # noqa: E402
from logging_setup import get_logger  # noqa: E402
from rag import context_for  # noqa: E402
from training_manager import run_training  # noqa: E402
from util import FileLock, free_disk_mb, validate_url  # noqa: E402
from workers import running, start_all, stop_all  # noqa: E402
from config import TRAIN_LOCK_PATH  # noqa: E402

log = get_logger("control")


def cmd_add_url(url: str) -> int:
    try:
        url = validate_url(url)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if db.enqueue(url):
        print(f"queued {url}")
        return 0
    print(f"already queued {url}")
    return 0


def cmd_status() -> int:
    s = db.stats()
    c = corpus_stats()
    print("queue", s["queued"], "downloading", s["downloading"])
    print("downloads_ok", s["downloads_ok"], "failed", s["downloads_failed"])
    print("documents", s["documents"], "pending_train", s["pending_train"])
    print("dataset_bytes", c["bytes"], "dataset_docs", c["documents"])
    print("latest_ingestion", s["latest_ingestion"])
    print("latest_training", s["latest_training"])
    print("disk_mb", free_disk_mb(PROJ))
    print("workers", running())
    t = FileLock(TRAIN_LOCK_PATH)
    busy = not t.acquire(False)
    if not busy:
        t.release()
    print("training", busy)
    print("model", MLX_MODEL)
    return 0


def cmd_health() -> int:
    code, lines = health()
    print("\n".join(lines))
    return code


def cmd_train() -> int:
    return run_training(resume=True)


def cmd_ask(q: str) -> int:
    ctx = context_for(q)
    print(ctx or "(no local hits)")
    return 0


MENU = """
A. Add URL to queue
B. Show queue
C. Show download history
D. Show dataset size
E. Show number of documents
F. Rebuild train/validation/test datasets
G. Trigger training immediately
H. Show training status
I. Show errors
J. Run health check
K. Start background workers
L. Stop workers
M. Exit
"""


def interactive() -> int:
    while True:
        print(MENU)
        choice = input("> ").strip().upper()
        if choice == "A":
            u = input("URL: ").strip()
            cmd_add_url(u)
        elif choice == "B":
            for r in db.queue_rows():
                print(dict(r))
        elif choice == "C":
            for r in db.history():
                print(dict(r))
        elif choice == "D":
            print(corpus_stats())
        elif choice == "E":
            print(db.stats()["documents"])
        elif choice == "F":
            print(rebuild_splits())
        elif choice == "G":
            sys.exit(cmd_train())
        elif choice == "H":
            print(db.stats()["latest_training"])
        elif choice == "I":
            for r in db.errors():
                print(dict(r))
        elif choice == "J":
            cmd_health()
        elif choice == "K":
            print("started" if start_all() else "already running")
            if running():
                print("workers live — Ctrl+C to return after stop via L")
        elif choice == "L":
            stop_all()
        elif choice == "M":
            return 0
        else:
            print("unknown")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Private local learn pipeline")
    sub = p.add_subparsers(dest="cmd")
    a = sub.add_parser("add-url")
    a.add_argument("url")
    sub.add_parser("status")
    sub.add_parser("health")
    sub.add_parser("train")
    sub.add_parser("rebuild")
    sub.add_parser("start")
    sub.add_parser("stop")
    sub.add_parser("queue")
    sub.add_parser("errors")
    q = sub.add_parser("ask")
    q.add_argument("query")
    sub.add_parser("serve")
    args = p.parse_args(argv)

    if args.cmd is None:
        return interactive()
    if args.cmd == "add-url":
        return cmd_add_url(args.url)
    if args.cmd == "status":
        return cmd_status()
    if args.cmd == "health":
        return cmd_health()
    if args.cmd == "train":
        return cmd_train()
    if args.cmd == "rebuild":
        print(rebuild_splits())
        return 0
    if args.cmd == "start":
        if not start_all():
            return 1

        def _stop(sig, frm):
            stop_all()
            sys.exit(0)

        signal.signal(signal.SIGINT, _stop)
        signal.signal(signal.SIGTERM, _stop)
        while True:
            time.sleep(3600)
    if args.cmd == "stop":
        stop_all()
        return 0
    if args.cmd == "queue":
        for r in db.queue_rows():
            print(dict(r))
        return 0
    if args.cmd == "errors":
        for r in db.errors():
            print(dict(r))
        return 0
    if args.cmd == "ask":
        return cmd_ask(args.query)
    if args.cmd == "serve":
        return cmd_status()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
