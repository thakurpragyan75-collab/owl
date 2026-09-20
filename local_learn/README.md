# Local Learn

Private ingestion + retrieval + MLX LoRA on your Mac. **No OpenAI, Anthropic, Groq, Gemini, OpenRouter, hosted embeddings, or telemetry.**

Internet is used only when you enqueue a public URL, or when `pip` / MLX first-time model fetch runs.

This does **not** replace OWL. It is a separate roost for local learning. OWL stays as the companion UI.

## Honest 8 GB limit

`Llama-3.2-1B-Instruct-4bit` + LoRA with `batch_size=1` and `max_seq_length=512` is the ceiling. You cannot “train on the whole universe.” The pipeline stops when RAM or disk is low. Fine-tuning is delayed until **25 new docs** or **8 MB** of corpus **and** the machine is idle.

New knowledge between trains: **SQLite FTS5 RAG** (`python super_grok_control.py ask "…"`).

```
URL → queue → download (.part then atomic) → raw_downloads/
    → watchdog → parse/clean → hash/dedupe → SQLite
    → dataset.jsonl append → delete raw
    → FTS index (RAG)
    → optional split → mlx_lm.lora → my_private_model/adapters
```

## Install (Apple Silicon)

```bash
cd local_learn
chmod +x setup.sh start.sh run_mlx_training.sh scripts/install_launchagent.sh
./setup.sh
```

`setup.sh` creates `.venv`, installs Python deps, tries `mlx` + `mlx-lm` only on `Darwin arm64`, initializes SQLite, runs a health check.

## Start

```bash
./start.sh
```

Workers: downloader + folder watcher + train policy.

CLI:

```bash
python super_grok_control.py add-url "https://example.com/paper.pdf"
python super_grok_control.py status
python super_grok_control.py health
python super_grok_control.py rebuild
python super_grok_control.py train
python super_grok_control.py ask "what did I ingest about LoRA"
python super_grok_control.py
```

Interactive menu: A–L workers, **M exit**.

Manual train:

```bash
./run_mlx_training.sh
```

Resume uses the last `ok` adapter under `my_private_model/adapters`.

## LaunchAgent (optional)

```bash
./scripts/install_launchagent.sh
# launchctl load -w ~/Library/LaunchAgents/local.learn.autonomous.plist
```

`RunAtLoad` is **false** so login does not start a surprise train.

## What stays local vs what hits the network

| Local | Network |
|---|---|
| parse, clean, SQLite, JSONL, FTS, LoRA | your queued URLs |
| logs, adapters, RAG | first `pip` / MLX weight download |

robots.txt is respected. Private/loopback IPs blocked. Max file 25 MB. No paywall bypass.

## Tests

```bash
source .venv/bin/activate
pytest -q
```

## Layout

See `config.py`. Corpus: `training_data/dataset.jsonl`. Splits: `train.jsonl` / `valid.jsonl` / `test.jsonl` (90/5/5, seed 42).
