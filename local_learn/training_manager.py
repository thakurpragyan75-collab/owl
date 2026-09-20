from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from config import (
    ACTIVE_ADAPTER,
    BATCH_SIZE,
    GRAD_ACCUM,
    IDLE_LOAD_THRESHOLD,
    ITERS,
    LEARNING_RATE,
    LOG_DIR,
    LORA_LAYERS,
    MAX_SEQ_LENGTH,
    MIN_FREE_DISK_MB,
    MIN_FREE_RAM_MB,
    MLX_MODEL,
    MODEL_DIR,
    RUNS_DIR,
    SAVE_EVERY,
    TRAIN_AFTER_MB,
    TRAIN_AFTER_NEW_DOCS,
    TRAIN_FAIL_BACKOFF_SEC,
    TRAIN_JSONL,
    TRAIN_LOCK_PATH,
    TRAIN_ONLY_IDLE,
    VAL_BATCHES,
)
from database import db
from dataset_manager import corpus_stats, rebuild_splits
from logging_setup import get_logger
from util import FileLock, available_ram_mb, free_disk_mb, is_idle

log = get_logger("train")
_last_fail_at = 0.0


def memory_ok() -> tuple[bool, str]:
    ram = available_ram_mb()
    disk = free_disk_mb(MODEL_DIR)
    if ram is not None and ram < MIN_FREE_RAM_MB:
        return False, f"only {ram} MB RAM free (need {MIN_FREE_RAM_MB})"
    if disk < MIN_FREE_DISK_MB:
        return False, f"only {disk} MB disk free"
    return True, "ok"


def should_autostart() -> tuple[bool, str]:
    global _last_fail_at
    if _last_fail_at and time.time() - _last_fail_at < TRAIN_FAIL_BACKOFF_SEC:
        return False, "training backoff after failure"
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


def _set_active(run_dir: Path, checkpoint: str, result: str) -> None:
    payload = {
        "path": checkpoint,
        "run": str(run_dir),
        "base_model": MLX_MODEL,
        "result": result,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    ACTIVE_ADAPTER.write_text(json.dumps(payload, indent=2))


def run_training(resume: bool = True) -> int:
    global _last_fail_at
    lock = FileLock(TRAIN_LOCK_PATH)
    if not lock.acquire(False):
        log.error("training already running")
        return 2
    run_id = db.start_training()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = RUNS_DIR / f"{run_id}-{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / f"train-{run_id}.log"
    try:
        ok, msg = memory_ok()
        if not ok:
            db.finish_training(run_id, "failed", None, msg)
            _last_fail_at = time.time()
            return 3
        mlx_ok, mlx_msg = mlx_available()
        if not mlx_ok:
            db.finish_training(run_id, "failed", None, mlx_msg)
            _last_fail_at = time.time()
            return 4
        rebuild_splits()
        if not TRAIN_JSONL.exists() or TRAIN_JSONL.stat().st_size == 0:
            db.finish_training(run_id, "failed", None, "empty train.jsonl")
            return 5
        meta = {
            "base_model": MLX_MODEL,
            "batch_size": BATCH_SIZE,
            "lora_layers": LORA_LAYERS,
            "iters": ITERS,
            "max_seq_length": MAX_SEQ_LENGTH,
            "learning_rate": LEARNING_RATE,
            "dataset_bytes": corpus_stats()["bytes"],
        }
        (run_dir / "config.json").write_text(json.dumps(meta, indent=2))
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
            str(run_dir),
            "--batch-size",
            str(BATCH_SIZE),
            "--lora-layers",
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
        with log_path.open("w", encoding="utf-8") as lf:
            proc = subprocess.Popen(cmd, stdout=lf, stderr=subprocess.STDOUT, text=True)
            code = proc.wait()
        tail = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        if code != 0:
            db.finish_training(run_id, "failed", ckpt, tail)
            _last_fail_at = time.time()
            log.error("training failed code=%s", code)
            return code or 1
        adapters = sorted(run_dir.glob("*.safetensors"))
        last = str(adapters[-1]) if adapters else str(run_dir)
        db.finish_training(run_id, "ok", last, tail)
        db.mark_docs_trained()
        _set_active(run_dir, last, "ok")
        log.info("training ok checkpoint=%s", last)
        return 0
    except Exception as e:
        log.exception("training crash")
        db.finish_training(run_id, "failed", None, str(e))
        _last_fail_at = time.time()
        return 1
    finally:
        lock.release()
        try:
            import gc

            gc.collect()
        except Exception:
            pass
