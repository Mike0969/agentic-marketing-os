#!/usr/bin/env bash
# launchd wrapper for the trading dashboard server (FastAPI on :8000).
# This is a PURE READ-ONLY view over the collected cache — it never touches the
# TradingView MCP, so it's safe to run continuously alongside the scanner and
# the other MCP clients. It recomputes the snapshot from SQLite locally.
set -euo pipefail

export PATH="/Users/dubai/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
export HOME="/Users/dubai"

ENV_FILE="/Users/dubai/Claude Folder/agentic-marketing-os/trading/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "/Users/dubai/Claude Folder/agentic-marketing-os/trading"
exec uv run python -m trading.server
