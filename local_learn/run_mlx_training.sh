#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then
  echo "Run ./setup.sh first" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -c "import mlx, mlx_lm" || { echo "mlx / mlx-lm not installed (Apple Silicon required)" >&2; exit 4; }
if [[ ! -s training_data/train.jsonl ]]; then
  echo "No train.jsonl — ingest documents and run: python super_grok_control.py rebuild" >&2
  exit 5
fi
if [[ -f state/training.lock ]]; then
  # lock file may be stale; python manager still uses flock
  :
fi
exec python super_grok_control.py train
