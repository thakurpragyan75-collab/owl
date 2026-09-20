# OWL

A watchful companion. The **HUD stays the same**. The **talking brain is local**.

```
OWL HUD
  → conversation
      → local model (MLX Llama-3.2-1B-Instruct-4bit on Apple Silicon)
          → nest memory (this device)
          → local RAG (SQLite FTS)
          → optional LoRA adapter
```

Normal chat does **not** call SuperGrok, xAI, OpenAI, or any cloud LLM.

Wake word: **hey owl**.

## Offline vs online

| Works with Wi-Fi off | Needs the internet |
|---|---|
| HUD, nest, arcade, relics, timer, open-tab, Print UI | Forge stills (Imagine) |
| Talk / math / code help via local model | Weave clips (Imagine) |
| Local knowledge you ingested | Gaze describe / face sheet (vision API) |
| Browser voice (speech synthesis + Web Speech) | First model-weight download |
| | Play a YouTube track, Maps, WhatsApp links |

If you ask for a still or clip while offline, that path fails honestly. Chat does not secretly hop to Grok.

## Local mind

On a Mac: `./local_learn/setup.sh` then `./local_learn/start.sh`.

- Engine: **MLX** `mlx-community/Llama-3.2-1B-Instruct-4bit` (8 GB machine, batch 1)
- Linux/dev sidecar: llama.cpp GGUF of the same 1B family on `127.0.0.1:8765`
- UI talks only to that loopback service for chat

A 1B model is **not** a frontier cloud model. It will converse, help with Python, and use what you ingested. It will not match Grok 4.5.

Fine-tuning is **optional** and never runs per-file. RAG is how new documents become answers without a train.

## What the HUD still does

- **Ear** — mic + Web Speech; hold-to-clip if dictation is missing
- **Gaze** — camera; observe / OWL-FACE / seed (vision stills need Imagine when you ask)
- **Nest** — name, city, song, notes, people on this device
- **Studio** — stills, clips, restyle, seed (Imagine)
- **Print** — your public email footprint
- **Arcade / Relics / Open / Music / WhatsApp** — unchanged

## Talk

```
hey owl
explain recursion
what have I collected about transformers
play song believer
open instagram
as me in ghibli
```

## Local pipeline

See [local_learn/README.md](local_learn/README.md).
