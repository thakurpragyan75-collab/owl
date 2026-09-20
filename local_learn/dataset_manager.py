from __future__ import annotations

import json
import random
from pathlib import Path

from config import DATASET_JSONL, SPLIT_RATIOS, SPLIT_SEED, TEST_JSONL, TRAIN_DIR, TRAIN_JSONL, VALID_JSONL
from logging_setup import get_logger
from util import atomic_write_text, json_one_line, sha256_text

log = get_logger("dataset")

INSTRUCTION = (
    "<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n"
    "Internalize the following source material for later answers. "
    "Do not invent facts beyond it.\n\n{body}"
    "<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
    "Stored."
    "<|eot_id|>"
)


def append_corpus(text: str) -> None:
    TRAIN_DIR.mkdir(parents=True, exist_ok=True)
    line = json_one_line({"text": text}) + "\n"
    with DATASET_JSONL.open("a", encoding="utf-8") as f:
        f.write(line)
        f.flush()


def iter_corpus() -> list[str]:
    if not DATASET_JSONL.exists():
        return []
    out: list[str] = []
    with DATASET_JSONL.open(encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"corrupt JSONL line {i}: {e}") from e
            t = obj.get("text")
            if not isinstance(t, str):
                raise ValueError(f"corrupt JSONL line {i}: missing text")
            out.append(t)
    return out


def corpus_stats() -> dict:
    texts = []
    bad = 0
    if DATASET_JSONL.exists():
        for line in DATASET_JSONL.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                texts.append(json.loads(line)["text"])
            except Exception:
                bad += 1
    size = DATASET_JSONL.stat().st_size if DATASET_JSONL.exists() else 0
    return {"documents": len(texts), "bytes": size, "corrupt_lines": bad, "chars": sum(len(t) for t in texts)}


def rebuild_splits() -> dict:
    texts = iter_corpus()
    # unique by hash, stable order
    seen: set[str] = set()
    uniq: list[str] = []
    for t in texts:
        h = sha256_text(t)
        if h in seen:
            continue
        seen.add(h)
        uniq.append(t)
    rng = random.Random(SPLIT_SEED)
    order = list(range(len(uniq)))
    rng.shuffle(order)
    n = len(order)
    n_train = int(n * SPLIT_RATIOS[0])
    n_valid = int(n * SPLIT_RATIOS[1])
    train_i = set(order[:n_train])
    valid_i = set(order[n_train : n_train + n_valid])
    test_i = set(order[n_train + n_valid :])
    buckets = {"train": [], "valid": [], "test": []}
    for i, t in enumerate(uniq):
        rec = json_one_line({"text": INSTRUCTION.format(body=t[:6000])})
        if i in train_i:
            buckets["train"].append(rec)
        elif i in valid_i:
            buckets["valid"].append(rec)
        else:
            buckets["test"].append(rec)
    for path, key in ((TRAIN_JSONL, "train"), (VALID_JSONL, "valid"), (TEST_JSONL, "test")):
        atomic_write_text(path, "\n".join(buckets[key]) + ("\n" if buckets[key] else ""))
    log.info("splits train=%s valid=%s test=%s", len(buckets["train"]), len(buckets["valid"]), len(buckets["test"]))
    return {k: len(v) for k, v in buckets.items()}
