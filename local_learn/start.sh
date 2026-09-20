#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then
  echo "Run ./setup.sh first"
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -c "from health import health; c,l=health(); print('\n'.join(l)); raise SystemExit(0 if c==0 else c)"
# Local mind on loopback, then workers.
python owl_service.py >>logs/owl_service.log 2>&1 &
echo $! > state/owl_service.pid
exec python super_grok_control.py start
