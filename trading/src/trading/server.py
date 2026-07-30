"""FastAPI server: a pure READ-ONLY view over the collected OHLCV cache.

IMPORTANT architectural choice: this server NEVER touches the TradingView MCP.
It reads bars from the SQLite cache (filled by the separate launchd scanner)
and recomputes the EVWMA + score snapshot locally. This means:
  - it can't collide with the scanner or the other MCP clients on the CDP bridge
  - it's instant (no 5-min chart-switching wait)
  - it's always safe to run continuously as a dashboard

Serves: GET / (dashboard), GET /api/snapshot, GET /api/health, WS /ws.
The dashboard auto-refreshes every 30s and via WebSocket on new data.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse

from . import config
from .config import settings
from .evwma import compute_evwma
from .scoring import InstrumentFeatures, Snapshot, score_all
from .store import Store

log = logging.getLogger("trading.server")

DASHBOARD_DIR = Path(__file__).parent / "dashboard"

# Global store + last-snapshot. Created once at startup.
store: Store | None = None
last_snapshot: Snapshot | None = None
last_cache_key: str = ""  # changes when cache is updated -> WS push trigger


def _row_dict(r) -> dict:
    return {
        "symbol": r.symbol,
        "group": r.group,
        "state": r.state,
        "score": r.score,
        "rank": r.break_rank.rank,
        "broke_at": r.break_rank.time,
        "direction": r.direction,
        "raw_direction": r.raw_direction,
        "inverted": r.inverted,
        "lag_distance": r.lag_distance,
        "trend_strength_pct": r.trend_strength_pct,
        "flags": r.flags,
        "range_high": r.range_high,
        "range_low": r.range_low,
        "poc": r.poc,
        "is_best_lag": r.is_best_lag,
    }


def snapshot_payload(snap: Snapshot | None) -> dict:
    if snap is None:
        return {"ready": False, "rows": []}
    return {
        "ready": True,
        "generated_at": snap.generated_at,
        "usd_direction": snap.usd_direction,
        "usd_state": snap.usd_state,
        "usd_confidence": snap.usd_confidence,
        "best_lag_symbol": snap.best_lag_symbol,
        "rows": [_row_dict(r) for r in snap.rows],
    }


def _cache_signature() -> str:
    """A string that changes when the cache gains new bars. Cheap proxy: row count
    + max timestamp across all instruments."""
    assert store is not None
    sig_parts = []
    for inst in config.instruments():
        last = store.last_bar_time(inst.symbol, config.PRIMARY_TF)
        sig_parts.append(f"{inst.symbol}:{last or 0}")
    return "|".join(sig_parts)


def compute_snapshot() -> Snapshot | None:
    """Recompute the full snapshot from the SQLite cache. No network calls."""
    assert store is not None
    features: dict[str, InstrumentFeatures] = {}
    for inst in config.instruments():
        primary_df = store.load_ohlcv(inst.symbol, config.PRIMARY_TF)
        context_df = store.load_ohlcv(inst.symbol, config.CONTEXT_TF)
        if primary_df is None or primary_df.empty or len(primary_df) < 60:
            continue
        # Ensure numeric dtypes (SQLite may return generic).
        for c in ("open", "high", "low", "close", "volume"):
            primary_df[c] = pd.to_numeric(primary_df[c], errors="coerce")
        # Defensive: drop any bars outside the symbol's plausible price range
        # (guards against any contamination that slipped into the cache).
        primary_df = primary_df[primary_df["close"].between(inst.price_min, inst.price_max)].reset_index(drop=True)
        if len(primary_df) < 60:
            continue
        primary = compute_evwma(primary_df)
        context = None
        context_clean = None
        if context_df is not None and not context_df.empty and len(context_df) >= 60:
            for c in ("open", "high", "low", "close", "volume"):
                context_df[c] = pd.to_numeric(context_df[c], errors="coerce")
            context_df = context_df[context_df["close"].between(inst.price_min, inst.price_max)].reset_index(drop=True)
            if len(context_df) >= 60:
                context = compute_evwma(context_df)
                context_clean = context_df
        features[inst.symbol] = InstrumentFeatures(
            symbol=inst.symbol, primary=primary, primary_df=primary_df,
            context=context, context_df=context_clean, invert=inst.invert,
            group=inst.group)
    if len(features) < 2:
        return None
    return score_all(features)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the store and start a background loop that recomputes the snapshot
    from the cache whenever it changes. No MCP, no collision."""
    global store, last_snapshot, last_cache_key
    store = Store()
    last_snapshot = compute_snapshot()
    last_cache_key = _cache_signature()
    task = asyncio.create_task(_watch_cache())
    yield
    task.cancel()
    if store is not None:
        store.close()


async def _watch_cache() -> None:
    """Every ~20s, check if the cache grew. If so, recompute + the WS loop pushes."""
    global last_snapshot, last_cache_key
    while True:
        await asyncio.sleep(20)
        try:
            sig = _cache_signature()
            if sig != last_cache_key:
                last_cache_key = sig
                snap = compute_snapshot()
                if snap is not None:
                    last_snapshot = snap
                    log.info("cache changed -> recomputed snapshot (%d rows)",
                             len(snap.rows))
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("cache watch error: %s", e)


app = FastAPI(title="Lead/Lag Trading Dashboard", lifespan=lifespan)


@app.get("/api/snapshot")
async def api_snapshot():
    return JSONResponse(snapshot_payload(last_snapshot))


@app.get("/api/health")
async def api_health():
    if store is None:
        return {"ready": False, "status": "starting"}
    snap = last_snapshot
    # Count instruments with data + cache freshness.
    n_with_data = 0
    latest = 0
    for inst in config.instruments():
        lt = store.last_bar_time(inst.symbol, config.PRIMARY_TF)
        if lt:
            n_with_data += 1
            latest = max(latest, lt)
    age_min = (time.time() - latest) / 60 if latest else None
    return {
        "ready": snap is not None,
        "instruments": n_with_data,
        "instruments_total": len(config.instruments()),
        "latest_bar_age_min": round(age_min, 1) if age_min else None,
        "snapshot_rows": len(snap.rows) if snap else 0,
        "generated_at": snap.generated_at if snap else None,
    }


@app.get("/", response_class=HTMLResponse)
async def index():
    html = (DASHBOARD_DIR / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    # Send current snapshot immediately.
    if last_snapshot is not None:
        await websocket.send_text(json.dumps(snapshot_payload(last_snapshot)))
    last_sig = last_cache_key
    try:
        while True:
            await asyncio.sleep(5)
            if last_cache_key != last_sig:
                last_sig = last_cache_key
                if last_snapshot is not None:
                    await websocket.send_text(json.dumps(snapshot_payload(last_snapshot)))
    except WebSocketDisconnect:
        return


def main() -> None:
    import uvicorn
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run("trading.server:app", host=settings.host, port=settings.port,
                reload=False, log_level="info")


if __name__ == "__main__":
    main()
