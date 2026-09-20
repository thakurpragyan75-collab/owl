#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then
  echo "Run ./setup.sh first"
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python health.py >/dev/null 2>&1 || python -c "from health import health; c,l=health(); print('\n'.join(l)); raise SystemExit(c)"
exec python super_grok_control.py start
