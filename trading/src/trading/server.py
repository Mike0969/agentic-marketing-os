"""FastAPI server: serves the dashboard and a WebSocket.

The WebSocket pushes a new snapshot only when the latched state changes (the
scanner publishes after each sweep; we forward to subscribers). Rest endpoint
/api/snapshot returns the current snapshot JSON.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse

from .config import settings
from .scanner import Scanner
from .scoring import Snapshot

log = logging.getLogger("trading.server")

DASHBOARD_DIR = Path(__file__).parent / "dashboard"

# Global scanner, created at startup.
scanner: Scanner | None = None


def _row_dict(r) -> dict:
    return {
        "symbol": r.symbol,
        "state": r.state,
        "score": r.score,
        "rank": r.break_rank.rank,
        "broke_at": r.break_rank.time,
        "direction": r.direction,
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global scanner
    scanner = Scanner()
    scanner.subscribe(lambda s: None)  # keep ref; WS reads scanner.snapshot
    # Start the sweep loop in the background.
    task = asyncio.create_task(_safe_run(scanner))
    yield
    task.cancel()
    await scanner.close()


async def _safe_run(s: Scanner) -> None:
    try:
        await s.run()
    except asyncio.CancelledError:
        raise
    except Exception as e:  # noqa: BLE001
        log.error("scanner crashed: %s", e)


app = FastAPI(title="Lead/Lag Trading Dashboard", lifespan=lifespan)


@app.get("/api/snapshot")
async def api_snapshot():
    return JSONResponse(snapshot_payload(scanner.snapshot if scanner else None))


@app.get("/api/health")
async def api_health():
    if scanner is None:
        return {"ready": False, "scanner": "starting"}
    snap = scanner.snapshot
    return {
        "ready": snap is not None,
        "source": scanner.source.name,
        "instruments": len(scanner.instruments),
        "last_sweep": snap.generated_at if snap else None,
    }


@app.get("/", response_class=HTMLResponse)
async def index():
    html = (DASHBOARD_DIR / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    # Send the current snapshot immediately.
    if scanner and scanner.snapshot:
        await websocket.send_text(json.dumps(snapshot_payload(scanner.snapshot)))
    # Poll the scanner for new published snapshots (latched transitions).
    last_at = scanner.snapshot.generated_at if scanner and scanner.snapshot else 0
    try:
        while True:
            await asyncio.sleep(2)
            snap = scanner.snapshot if scanner else None
            if snap and snap.generated_at != last_at:
                last_at = snap.generated_at
                await websocket.send_text(json.dumps(snapshot_payload(snap)))
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
