#!/bin/sh
set -eu
cd "$(dirname "$0")"
ROOT="$(pwd)"
node scripts/preview.mjs stop 2>/dev/null || true
if ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8765/v1/health; then
  if [ -f "$ROOT/local_learn/owl_service.py" ]; then
    mkdir -p "$ROOT/local_learn/logs" "$ROOT/local_learn/state"
    MODEL_ENGINE="${MODEL_ENGINE:-llamacpp}" PYTHONUNBUFFERED=1 \
      python3 "$ROOT/local_learn/owl_service.py" >>/tmp/owl-mind.log 2>&1 &
  fi
fi
KERNEL_ROOT="${OWL_KERNEL_ROOT:-}"
if [ -z "$KERNEL_ROOT" ]; then
  if [ -d /workspace/owl-cognitive-kernel/src/owl_kernel ]; then
    KERNEL_ROOT=/workspace/owl-cognitive-kernel
  elif [ -d "$HOME/owl-cognitive-kernel/src/owl_kernel" ]; then
    KERNEL_ROOT="$HOME/owl-cognitive-kernel"
  elif [ -d "$ROOT/../owl-cognitive-kernel/src/owl_kernel" ]; then
    KERNEL_ROOT="$ROOT/../owl-cognitive-kernel"
  fi
fi
if [ -n "${KERNEL_ROOT:-}" ] && ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8770/v1/health; then
  PYTHONPATH="$KERNEL_ROOT/src" PYTHONUNBUFFERED=1 \
    python3 -m owl_kernel.service --host 127.0.0.1 --port 8770 \
      --repo "$KERNEL_ROOT/examples/shop_repo" >>/tmp/owl-kernel.log 2>&1 &
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
