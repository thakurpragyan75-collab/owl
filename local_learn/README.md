# Local Learn — OWL's on-machine mind

OWL's HUD is the web app. This folder is the **brain**: local LLM, RAG, downloads, optional LoRA.

```
React HUD  →  http://127.0.0.1:8765/v1/chat  →  Local provider (MLX)
                                              →  RAG (SQLite FTS5)
                                              →  tools (sandboxed)
```

No SuperGrok, xAI, OpenAI, Anthropic, Gemini, Groq, OpenRouter, or hosted embeddings **for conversation**.

## Layers (do not mix them up)

| Layer | What it is | Offline? |
|---|---|---|
| **MODEL** | Llama-3.2-1B-Instruct-4bit via MLX (Mac). GGUF llama.cpp if MLX missing | After first weight fetch |
| **MEMORY** | Nest in the HUD (localStorage) + SQLite pipeline state | Yes |
| **RAG** | FTS5 chunks of ingested docs | Yes |
| **FINE-TUNE** | Optional LoRA, never per-file | Yes (compute) |
| **TOOLS** | list/read/search sandbox, calculate, tiny Python | Yes |
| **WEB DOWNLOADS** | URLs you enqueue | Needs net for the fetch |
| **VOICE** | Browser speech synthesis + Web Speech | Yes |
| **STUDIO** | Imagine stills/clips live in the HUD, not here | Net |

## Install (Apple Silicon)

```bash
cd local_learn
chmod +x setup.sh start.sh run_mlx_training.sh scripts/install_launchagent.sh
./setup.sh
./start.sh
```

One-command start loads the loopback mind, then the downloader/watcher.

```bash
python super_grok_control.py add-url "https://example.com/paper.pdf"
python super_grok_control.py health
python super_grok_control.py ask "what did I save about this project"
python -m pytest -q
```

Offline conversation test:

```bash
MODEL_ENGINE=stub python -m pytest -q tests/test_local_mind.py
```

That stub is **tests only**. Production `MODEL_ENGINE` is `mlx` (Mac) or `llamacpp` (this Linux nest).

## Launch

HUD: the OWL app. Mind: `python owl_service.py` (bound to 127.0.0.1).

Health: `python health.py` and `GET http://127.0.0.1:8765/v1/health`

## 8 GB limits

Batch 1, seq 512, 4 LoRA layers. Training only after 25 docs or 8 MB **and** idle. Failed trains back off 15 minutes. You cannot train on the whole universe.
