"""SQLite store: OHLCV cache, event log, and latched states.

The rolling cache grows over time (every live pull upserts new bars) so the
backtest has progressively deeper history even though the MCP caps at ~500
bars/call.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from typing import Iterable

import pandas as pd

from .config import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS ohlcv (
    symbol TEXT NOT NULL,
    tf     TEXT NOT NULL,
    time   INTEGER NOT NULL,
    open   REAL, high REAL, low REAL, close REAL, volume REAL,
    PRIMARY KEY (symbol, tf, time)
);
CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      REAL NOT NULL,
    symbol  TEXT,
    type    TEXT NOT NULL,
    payload TEXT
);
CREATE TABLE IF NOT EXISTS states (
    symbol    TEXT PRIMARY KEY,
    state     TEXT NOT NULL,
    score     REAL,
    updated_at REAL NOT NULL,
    payload   TEXT
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


class Store:
    """Thread-safe SQLite wrapper. Connections are per-call (SQLite handles
    its own locking); we use a single connection guarded by a lock."""

    def __init__(self, path: str | None = None) -> None:
        self.path = path or settings.db_path
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    # --- OHLCV cache --------------------------------------------------------
    def upsert_ohlcv(self, symbol: str, tf: str, df: pd.DataFrame) -> int:
        rows = []
        for _, r in df.iterrows():
            rows.append((symbol, tf, int(r["time"]), float(r["open"]), float(r["high"]),
                         float(r["low"]), float(r["close"]), float(r.get("volume", 0.0))))
        with self._lock:
            cur = self._conn.executemany(
                "INSERT OR REPLACE INTO ohlcv VALUES (?,?,?,?,?,?,?,?)", rows)
            self._conn.commit()
            return cur.rowcount

    def load_ohlcv(self, symbol: str, tf: str, bars: int | None = None) -> pd.DataFrame:
        q = ("SELECT time, open, high, low, close, volume FROM ohlcv "
             "WHERE symbol=? AND tf=? ORDER BY time ASC")
        if bars:
            q += f" LIMIT {int(bars)}"
        with self._lock:
            df = pd.read_sql_query(q, self._conn, params=(symbol, tf))
        return df

    def last_bar_time(self, symbol: str, tf: str) -> int | None:
        with self._lock:
            cur = self._conn.execute(
                "SELECT MAX(time) FROM ohlcv WHERE symbol=? AND tf=?", (symbol, tf))
            row = cur.fetchone()
        return row[0] if row and row[0] is not None else None

    # --- Events -------------------------------------------------------------
    def log_event(self, ts: float, symbol: str | None, type_: str, payload: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO events (ts, symbol, type, payload) VALUES (?,?,?,?)",
                (ts, symbol, type_, json.dumps(payload, default=str)))
            self._conn.commit()

    def recent_events(self, limit: int = 50) -> list[dict]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT ts, symbol, type, payload FROM events ORDER BY id DESC LIMIT ?",
                (limit,))
            rows = cur.fetchall()
        return [{"ts": r[0], "symbol": r[1], "type": r[2],
                 "payload": json.loads(r[3] or "{}")} for r in rows]

    # --- States -------------------------------------------------------------
    def upsert_state(self, symbol: str, state: str, score: float, payload: dict) -> None:
        import time as _t
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO states (symbol, state, score, updated_at, payload) "
                "VALUES (?,?,?,?,?)",
                (symbol, state, score, _t.time(), json.dumps(payload, default=str)))
            self._conn.commit()

    def all_states(self) -> list[dict]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT symbol, state, score, updated_at, payload FROM states")
            rows = cur.fetchall()
        return [{"symbol": r[0], "state": r[1], "score": r[2], "updated_at": r[3],
                 "payload": json.loads(r[4] or "{}")} for r in rows]

    # --- Meta ---------------------------------------------------------------
    def set_meta(self, key: str, value: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)", (key, value))
            self._conn.commit()

    def get_meta(self, key: str) -> str | None:
        with self._lock:
            cur = self._conn.execute("SELECT value FROM meta WHERE key=?", (key,))
            row = cur.fetchone()
        return row[0] if row else None

    def close(self) -> None:
        with self._lock:
            self._conn.close()
