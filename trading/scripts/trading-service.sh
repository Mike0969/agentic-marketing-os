#!/usr/bin/env bash
# Manage the trading launchd agents: scanner (15-min data collector) and
# server (continuous dashboard on :8000).
#
# Usage:
#   ./scripts/trading-service.sh <scanner|server|both> <install|uninstall|status|logs>
#
# Examples:
#   ./scripts/trading-service.sh both install      # install + start everything
#   ./scripts/trading-service.sh server status     # is the dashboard up?
#   ./scripts/trading-service.sh scanner logs      # tail data collector
set -euo pipefail

ROOT="/Users/dubai/Claude Folder/agentic-marketing-os"
LOG_DIR="$ROOT/trading/logs"

which="${1:-both}"
cmd="${2:-status}"

labels() {
  case "$1" in
    scanner) echo "com.zcode.trading-scanner" ;;
    server)  echo "com.zcode.trading-server" ;;
    both)    echo "com.zcode.trading-scanner com.zcode.trading-server" ;;
    *) echo "unknown service: $1 (use scanner|server|both)" >&2; exit 2 ;;
  esac
}

do_one() {
  local label="$1" action="$2"
  local plist_src="$ROOT/trading/scripts/${label}.plist"
  local plist_dst="$HOME/Library/LaunchAgents/${label}.plist"
  case "$action" in
    install)
      mkdir -p "$LOG_DIR" "$(dirname "$plist_dst")"
      chmod +x "$ROOT/trading/scripts/run-scanner.sh" "$ROOT/trading/scripts/run-server.sh" 2>/dev/null || true
      cp "$plist_src" "$plist_dst"
      launchctl unload "$plist_dst" 2>/dev/null || true
      launchctl load -w "$plist_dst"
      echo "[$label] installed + started"
      ;;
    uninstall)
      if [[ -f "$plist_dst" ]]; then
        launchctl unload "$plist_dst" 2>/dev/null || true
        rm -f "$plist_dst"
        echo "[$label] stopped + removed"
      else
        echo "[$label] not installed"
      fi
      ;;
    status)
      if ! launchctl list "$label" >/dev/null 2>&1; then
        echo "[$label] NOT INSTALLED"
      elif [[ "$label" == *server ]]; then
        if curl -sf --max-time 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
          echo "[$label] RUNNING — http://127.0.0.1:8000 ✓"
        else
          echo "[$label] loaded but not responding on :8000 (starting?)"
        fi
      else
        if pgrep -f "trading.scanner.*--once" >/dev/null 2>&1; then
          echo "[$label] RUNNING (a 15-min sweep is in progress)"
        else
          echo "[$label] INSTALLED — idle between sweeps (fires every 15 min + at login)"
        fi
      fi
      ;;
    logs)
      tail -f "$LOG_DIR/${label/com.zcode.trading-/}.err.log" "$LOG_DIR/${label/com.zcode.trading-/}.out.log" 2>/dev/null || echo "no logs at $LOG_DIR"
      ;;
    *) echo "Usage: $0 <scanner|server|both> <install|uninstall|status|logs>" >&2; exit 2 ;;
  esac
}

for label in $(labels "$which"); do
  do_one "$label" "$cmd"
done
