from __future__ import annotations

import importlib
import sys

from config import DIRS, MIN_FREE_DISK_MB, MLX_MODEL, ROOT, TRAIN_LOCK_PATH
from dataset_manager import corpus_stats
from util import FileLock, available_ram_mb, free_disk_mb
from workers import running as workers_running

REQUIRED = ["requests", "bs4", "lxml", "pypdf", "feedparser", "watchdog"]


def health() -> tuple[int, list[str]]:
    lines: list[str] = []
    crit = False
    lines.append(f"python {sys.version.split()[0]}")
    for pkg in REQUIRED:
        try:
            importlib.import_module(pkg if pkg != "bs4" else "bs4")
            lines.append(f"ok package {pkg}")
        except ImportError:
            lines.append(f"FAIL package {pkg}")
            crit = True
    for d in DIRS:
        try:
            d.mkdir(parents=True, exist_ok=True)
            test = d / ".write_test"
            test.write_text("ok")
            test.unlink()
            lines.append(f"ok dir {d.name}")
        except Exception as e:
            lines.append(f"FAIL dir {d}: {e}")
            crit = True
    try:
        from database import db

        db.stats()
        lines.append("ok sqlite")
    except Exception as e:
        lines.append(f"FAIL sqlite {e}")
        crit = True
    disk = free_disk_mb(ROOT)
    if disk < MIN_FREE_DISK_MB:
        lines.append(f"FAIL disk {disk} MB")
        crit = True
    else:
        lines.append(f"ok disk {disk} MB")
    ram = available_ram_mb()
    lines.append(f"ram_available_mb {ram}")
    st = corpus_stats()
    lines.append(f"dataset docs={st['documents']} bytes={st['bytes']} corrupt={st['corrupt_lines']}")
    if st["corrupt_lines"]:
        crit = True
        lines.append("FAIL corrupt JSONL")
    try:
        import mlx  # noqa: F401

        lines.append("ok mlx")
    except ImportError:
        lines.append("WARN mlx missing (install on Apple Silicon before training)")
    try:
        import mlx_lm  # noqa: F401

        lines.append("ok mlx_lm")
    except ImportError:
        lines.append("WARN mlx-lm missing")
    lines.append(f"model id {MLX_MODEL}")
    lines.append(f"workers_running {workers_running()}")
    tlock = FileLock(TRAIN_LOCK_PATH)
    busy = not tlock.acquire(False)
    if not busy:
        tlock.release()
    lines.append(f"training_running {busy}")
    return (1 if crit else 0, lines)


if __name__ == "__main__":
    code, lines = health()
    print("\n".join(lines))
    raise SystemExit(code)
