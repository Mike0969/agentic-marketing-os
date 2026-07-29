#!/usr/bin/env bash
# Manage the trading-scanner launchd agent: install | uninstall | status | logs
# Usage:
#   ./scripts/scanner-service.sh install    # auto-starts now + at login
#   ./scripts/scanner-service.sh uninstall  # stops + removes
#   ./scripts/scanner-service.sh status     # is it running?
#   ./scripts/scanner-service.sh logs       # tail the logs
set -euo pipefail

LABEL="com.zcode.trading-scanner"
PLIST_SRC="/Users/dubai/Claude Folder/agentic-marketing-os/trading/scripts/com.zcode.trading-scanner.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="/Users/dubai/Claude Folder/agentic-marketing-os/trading/logs"

cmd="${1:-status}"

case "$cmd" in
  install)
    mkdir -p "$LOG_DIR" "$(dirname "$PLIST_DST")"
    chmod +x "/Users/dubai/Claude Folder/agentic-marketing-os/trading/scripts/run-scanner.sh"
    cp "$PLIST_SRC" "$PLIST_DST"
    # Unload if already loaded, then (re)load.
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    launchctl load -w "$PLIST_DST"
    echo "Installed and started: $LABEL"
    echo "Logs: $LOG_DIR/scanner.{out,err}.log"
    echo "Status: ./scripts/scanner-service.sh status"
    ;;
  uninstall)
    if [[ -f "$PLIST_DST" ]]; then
      launchctl unload "$PLIST_DST" 2>/dev/null || true
      rm -f "$PLIST_DST"
      echo "Stopped and removed: $LABEL"
    else
      echo "Not installed (no plist at $PLIST_DST)"
    fi
    ;;
  status)
    if ! launchctl list "$LABEL" >/dev/null 2>&1; then
      echo "NOT INSTALLED"
    elif pgrep -f "trading.scanner.*--once" >/dev/null 2>&1; then
      echo "RUNNING (a 15-min sweep is in progress now)"
    else
      echo "INSTALLED — idle between sweeps (fires every 15 min + at login)"
    fi
    ;;
  logs)
    tail -f "$LOG_DIR/scanner.out.log" "$LOG_DIR/scanner.err.log" 2>/dev/null || echo "no logs yet at $LOG_DIR"
    ;;
  *)
    echo "Usage: $0 {install|uninstall|status|logs}" >&2
    exit 2
    ;;
esac
