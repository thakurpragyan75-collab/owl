#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/local.learn.autonomous.plist"
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|REPLACE_WITH_ABS_PATH|$ROOT|g" "$ROOT/launchd/autonomous_learning.plist" > "$PLIST"
launchctl unload "$PLIST" 2>/dev/null || true
echo "Wrote $PLIST"
echo "Enable at login: launchctl load -w $PLIST"
echo "Start now:       launchctl start local.learn.autonomous"
echo "Default RunAtLoad is false so it will not surprise-train at boot."
