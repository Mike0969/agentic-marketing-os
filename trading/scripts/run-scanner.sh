#!/usr/bin/env bash
# launchd wrapper for the trading scanner.
# launchd runs with a minimal PATH, so we set an explicit one before invoking uv.
set -euo pipefail

export PATH="/Users/dubai/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
export HOME="/Users/dubai"

# Load trading/.env if present (TRADING_*, TELEGRAM_*).
ENV_FILE="/Users/dubai/Claude Folder/agentic-marketing-os/trading/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "/Users/dubai/Claude Folder/agentic-marketing-os/trading"
# --once: do one serial sweep of all instruments, persist, then exit.
# Run on a 15-min launchd cadence. This keeps the scanner "driving" the shared
# TradingView chart only briefly each cycle, minimizing collision with the
# other MCP clients (Hermes, Claude, Codex) that share the same CDP bridge.
exec uv run python -m trading.scanner --source mcp --once
