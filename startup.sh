#!/bin/sh
set -eu
cd /workspace
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
if ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8765/v1/health; then
  mkdir -p /workspace/local_learn/logs /workspace/local_learn/state
  MODEL_ENGINE="${MODEL_ENGINE:-llamacpp}" PYTHONUNBUFFERED=1 \
    python3 /workspace/local_learn/owl_service.py >>/tmp/owl-mind.log 2>&1 &
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
