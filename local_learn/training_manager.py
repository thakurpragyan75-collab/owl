from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from config import (
    ADAPTER_PATH,
    BATCH_SIZE,
    GRAD_ACCUM,
    IDLE_LOAD_THRESHOLD,
    ITERS,
    LEARNING_RATE,
    LORA_LAYERS,
    MAX_SEQ_LENGTH,
    MIN_FREE_DISK_MB,
    MIN_FREE_RAM_MB,
    MLX_MODEL,
    MODEL_DIR,
    SAVE_EVERY,
    TRAIN_AFTER_MB,
    TRAIN_AFTER_NEW_DOCS,
    TRAIN_JSONL,
    TRAIN_LOCK_PATH,
    TRAIN_ONLY_IDLE,
    VAL_BATCHES,
    VALID_JSONL,
)
from database import db
from dataset_manager import corpus_stats, rebuild_splits
from logging_setup import get_logger
from util import FileLock, available_ram_mb, free_disk_mb, is_idle

log = get_logger("train")


def memory_ok() -> tuple[bool, str]:
    ram = available_ram_mb()
    disk = free_disk_mb(MODEL_DIR)
    if ram is not None and ram < MIN_FREE_RAM_MB:
        return False, f"only {ram} MB RAM free (need {MIN_FREE_RAM_MB})"
    if disk < MIN_FREE_DISK_MB:
        return False, f"only {disk} MB disk free"
    return True, "ok"


def should_autostart() -> tuple[bool, str]:
    pending = db.pending_training_count()
    stats = corpus_stats()
    if pending < TRAIN_AFTER_NEW_DOCS and stats["bytes"] < TRAIN_AFTER_MB * 1024 * 1024:
        return False, f"policy: pending={pending} bytes={stats['bytes']}"
    if TRAIN_ONLY_IDLE and not is_idle(IDLE_LOAD_THRESHOLD):
        return False, "machine not idle"
    ok, msg = memory_ok()
    if not ok:
        return False, msg
    return True, "policy met"


def mlx_available() -> tuple[bool, str]:
    try:
        import mlx  # noqa: F401
        import mlx_lm  # noqa: F401
    except ImportError as e:
        return False, f"mlx/mlx-lm missing: {e}"
    return True, "mlx present"


def run_training(resume: bool = True) -> int:
    lock = FileLock(TRAIN_LOCK_PATH)
    if not lock.acquire(False):
        log.error("training already running")
        return 2
    run_id = db.start_training()
    try:
        ok, msg = memory_ok()
        if not ok:
            db.finish_training(run_id, "failed", None, msg)
            log.error(msg)
            return 3
        mlx_ok, mlx_msg = mlx_available()
        if not mlx_ok:
            db.finish_training(run_id, "failed", None, mlx_msg)
            log.error(mlx_msg)
            return 4
        rebuild_splits()
        if not TRAIN_JSONL.exists() or TRAIN_JSONL.stat().st_size == 0:
            db.finish_training(run_id, "failed", None, "empty train.jsonl")
            return 5
        ADAPTER_PATH.mkdir(parents=True, exist_ok=True)
        cmd = [
            sys.executable,
            "-m",
            "mlx_lm.lora",
            "--model",
            MLX_MODEL,
            "--train",
            "--data",
            str(TRAIN_JSONL.parent),
            "--adapter-path",
            str(ADAPTER_PATH),
            "--batch-size",
            str(BATCH_SIZE),
            "--lora-layers",
            str(LORA_LAYERS),
            "--num-layers",
            str(LORA_LAYERS),
            "--iters",
            str(ITERS),
            "--learning-rate",
            str(LEARNING_RATE),
            "--max-seq-length",
            str(MAX_SEQ_LENGTH),
            "--save-every",
            str(SAVE_EVERY),
            "--val-batches",
            str(VAL_BATCHES),
            "--grad-accumulation-steps",
            str(GRAD_ACCUM),
            "--seed",
            "42",
        ]
        ckpt = db.latest_checkpoint()
        if resume and ckpt and Path(ckpt).exists():
            cmd.extend(["--resume-adapter-file", ckpt])
        log.info("exec %s", " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True)
        tail = (proc.stdout or "")[-2000:] + "\n" + (proc.stderr or "")[-2000:]
        if proc.returncode != 0:
            db.finish_training(run_id, "failed", ckpt, tail)
            log.error("training failed code=%s", proc.returncode)
            return proc.returncode or 1
        adapters = sorted(ADAPTER_PATH.glob("*.safetensors"))
        last = str(adapters[-1]) if adapters else str(ADAPTER_PATH)
        db.finish_training(run_id, "ok", last, tail)
        db.mark_docs_trained()
        log.info("training ok checkpoint=%s", last)
        return 0
    except Exception as e:
        log.exception("training crash")
        db.finish_training(run_id, "failed", None, str(e))
        return 1
    finally:
        lock.release()
        try:
            import gc

            gc.collect()
        except Exception:
            pass
