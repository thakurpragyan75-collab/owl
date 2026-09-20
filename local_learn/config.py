"""Defensive defaults for an 8 GB Apple Silicon machine."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent

RAW_DIR = ROOT / "raw_downloads"
TRAIN_DIR = ROOT / "training_data"
MODEL_DIR = ROOT / "my_private_model"
LOG_DIR = ROOT / "logs"
STATE_DIR = ROOT / "state"
FIXTURE_DIR = ROOT / "tests" / "fixtures"

DB_PATH = STATE_DIR / "pipeline.db"
LOCK_PATH = STATE_DIR / "workers.lock"
TRAIN_LOCK_PATH = STATE_DIR / "training.lock"
PID_PATH = STATE_DIR / "workers.pid"
RAG_DB = STATE_DIR / "rag.sqlite"

DATASET_JSONL = TRAIN_DIR / "dataset.jsonl"
TRAIN_JSONL = TRAIN_DIR / "train.jsonl"
VALID_JSONL = TRAIN_DIR / "valid.jsonl"
TEST_JSONL = TRAIN_DIR / "test.jsonl"

# Networking
CONNECT_TIMEOUT = 15
READ_TIMEOUT = 45
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
MAX_REDIRECTS = 5
MAX_RETRIES = 4
USER_AGENT = "LocalLearn/1.0 (private local ingestion; +https://localhost)"
RESPECT_ROBOTS = True

# Quality
MIN_CHARS = 80
MAX_CHARS = 200_000
SPLIT_SEED = 42
SPLIT_RATIOS = (0.90, 0.05, 0.05)

# Training trigger (never train on every file)
TRAIN_AFTER_NEW_DOCS = 25
TRAIN_AFTER_MB = 8
TRAIN_ONLY_IDLE = True
IDLE_LOAD_THRESHOLD = 0.35
MIN_FREE_RAM_MB = 1500
MIN_FREE_DISK_MB = 2048

# MLX LoRA — conservative 8 GB
MLX_MODEL = os.environ.get("LOCAL_LEARN_MODEL", "mlx-community/Llama-3.2-1B-Instruct-4bit")
LORA_LAYERS = 4
BATCH_SIZE = 1
LEARNING_RATE = 1e-5
MAX_SEQ_LENGTH = 512
ITERS = 200
VAL_BATCHES = 4
SAVE_EVERY = 50
GRAD_ACCUM = 4
NUM_WORKERS_IO = 1

ADAPTER_PATH = MODEL_DIR / "adapters"

DIRS = (RAW_DIR, TRAIN_DIR, MODEL_DIR, LOG_DIR, STATE_DIR, ADAPTER_PATH)
