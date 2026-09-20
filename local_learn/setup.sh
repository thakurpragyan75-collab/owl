#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  python -m pip install 'mlx>=0.18.0' 'mlx-lm>=0.19.0' || echo "WARN: mlx install failed; training will be blocked until it succeeds"
fi
mkdir -p raw_downloads training_data my_private_model/adapters logs state
python - <<'PY'
from database import db
from health import health
db.stats()
code, lines = health()
print("\n".join(lines))
raise SystemExit(code)
PY
