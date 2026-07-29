# Lead/Lag Trading Dashboard

A Python service that detects correlated instruments breaking their EVWMA in
sequence, identifies the lagger (the trade candidate), and shows it on a
latched dashboard embedded in the Agentic OS `/trading` tab.

## The concept

Correlated instruments make the same move, but **not at the same time**. One
moves first (LEADER), one moves last (LAGGER). The lagger is the trade.

The trigger: a pair touches and breaks its EVWMA line.
- 1st pair to break → LEADER → "attention"
- 2nd pair breaks → trend is real on 15m
- 3rd/4th confirm
- The pair still furthest from breaking = LAGGER = the trade candidate

Setups **latch**: they do not change their mind tick to tick. Only a genuine
direction flip (consensus USD direction reversing) resets them.

## Requirements

- Python 3.11 (managed via `uv`)
- The TradingView MCP server (a CDP bridge) already on disk at
  `/Users/dubai/tradingview-mcp` — it drives **TradingView Desktop**, which must
  be running with `--remote-debugging-port=9222` for live data.

## Run

```bash
cd trading
uv run pytest                              # engine correctness (offline)
uv run python -m trading.server            # dashboard (FastAPI + WS) on :8000
uv run python -m trading.scanner --source mcp --once   # single sweep + exit
uv run python -m trading.backtest --source db --bars 16
```

Then open the `/trading` tab in the Agentic OS (the FastAPI server is served on
`http://127.0.0.1:8000` by default and iframe-embedded).

## Persistent data collection (accumulates edge-validation history)

The scanner runs as a **macOS launchd agent** that fires a one-shot sweep every
15 minutes (matching the 15m bar close) and exits. This keeps the time it
"drives" the shared TradingView CDP chart brief, minimizing collision with the
other MCP clients (Hermes/Claude/Codex) on the same bridge. The OHLCV cache in
`trading/data/trading.db` grows over time; once it has a few weeks of history,
re-run the backtest for a statistically meaningful edge measurement.

From the repo root:
```bash
npm run trading:install     # install + start the agent (auto-starts at login)
npm run trading:status      # is a sweep running?
npm run trading:logs        # tail the sweep logs
npm run trading:uninstall   # stop + remove
npm run trading:backtest    # measure the edge on accumulated data
```

Requirements for live data: **TradingView Desktop must be running** with
`--remote-debugging-port=9222` (it already is). The `VANTAGE:` broker prefix
is confirmed working; indices not on Vantage are pinned to TradingView's free
feeds (e.g. `TVC:NI225` for the Nikkei).


## Config

Copy `.env.example` to `.env`. Key vars:
- `TRADING_BROKER=VANTAGE` — **UNVERIFIED**. Confirm the symbol prefix TradingView
  uses for your feed via `chart_get_state` on the first live run, then update.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — reused from the marketing OS env
  for state-transition alerts.

## Data layer is swappable

`data_source.py` defines a `DataSource` interface with two implementations:
- `TradingViewMCPSource` — live; a Python MCP client that spawns the node server
  over stdio and drives it autonomously.
- `CsvSource` — offline backtest; reads `data/<symbol>_<tf>.csv`.

The scoring engine only depends on the interface, so a broker/vendor API can
replace the feed without touching `evwma.py` / `scoring.py`.

## Status of the edge

The engine math, latch logic, and data parsing are unit-tested and green
(`uv run pytest`). The **edge-validating backtest** (`backtest.py`) runs on real
cached OHLCV — it must accumulate in `trading/data/trading.db` from live scanner
runs before the backtest produces meaningful results.
