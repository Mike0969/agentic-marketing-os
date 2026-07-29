"""Data layer — swappable interface so a broker/vendor API can replace the
TradingView MCP feed without touching the scoring engine.

Two implementations:
  - CsvSource:        reads OHLCV CSVs from disk (backtest / offline).
  - TradingViewMCPSource: a Python MCP CLIENT. It spawns the node MCP server
    over stdio and drives chart_set_symbol/chart_set_timeframe/data_get_ohlcv
    autonomously (no agent in the loop at runtime). This is the live scanner.

The MCP returns two shapes (summary on/off). Both are parsed here. Gotchas
handled: time is unix SECONDS; change_pct is a STRING with a trailing '%';
on failure the payload is {success:false, error:...}.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass

import pandas as pd

from .config import TIMEFRAMES, settings


@dataclass
class OHLCV:
    df: pd.DataFrame  # columns: time, open, high, low, close, volume (oldest->newest)


class DataSource(ABC):
    """Swappable data interface consumed by the scoring engine."""

    @abstractmethod
    async def get_ohlcv(self, symbol: str, timeframe: str, bars: int) -> OHLCV | None: ...

    async def close(self) -> None: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


# --- CSV source (backtest / offline) ---------------------------------------
class CsvSource(DataSource):
    """Loads OHLCV CSVs named <data_dir>/<symbol>_<tf>.csv.

    Expected columns (any case): time, open, high, low, close, volume.
    `time` may be a unix timestamp (sec) or an ISO string; we normalize to sec.
    """

    def __init__(self, data_dir: str = "trading/data") -> None:
        self.data_dir = data_dir

    @property
    def name(self) -> str:
        return "csv"

    def _path(self, symbol: str, timeframe: str) -> str:
        return os.path.join(self.data_dir, f"{symbol}_{timeframe}.csv")

    async def get_ohlcv(self, symbol: str, timeframe: str, bars: int) -> OHLCV | None:
        path = self._path(symbol, timeframe)
        if not os.path.exists(path):
            return None
        df = pd.read_csv(path)
        df = _normalize_columns(df)
        if df.empty:
            return None
        df = df.sort_values("time").tail(bars).reset_index(drop=True)
        return OHLCV(df=df)


def _numeric_to_seconds(s: pd.Series) -> pd.Series:
    """Coerce numeric timestamps to unix seconds (s/ms/us/ns)."""
    med = float(s.median()) if len(s) else 0.0
    if med > 1e17:        # ns
        return (s // 10**9).astype("int64")
    if med > 1e14:        # us
        return (s // 10**6).astype("int64")
    if med > 1e11:        # ms
        return (s // 1000).astype("int64")
    return s.astype("int64")  # already seconds


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename = {}
    for c in df.columns:
        cl = c.strip().lower()
        if cl in {"timestamp", "date", "datetime", "time"}:
            rename[c] = "time"
        elif cl in {"open", "o"}:
            rename[c] = "open"
        elif cl in {"high", "h"}:
            rename[c] = "high"
        elif cl in {"low", "l"}:
            rename[c] = "low"
        elif cl in {"close", "c"}:
            rename[c] = "close"
        elif cl in {"volume", "vol", "v"}:
            rename[c] = "volume"
    df = df.rename(columns=rename)
    # Parse time -> unix seconds, robust to s/ms/us/ns and ISO strings.
    t = df["time"]
    if pd.api.types.is_numeric_dtype(t):
        df["time"] = _numeric_to_seconds(t)
    else:
        ts = pd.to_datetime(t, utc=True, errors="coerce")
        # tz-aware -> tz-naive UTC -> int64 seconds via numpy datetime64[s].
        naive = ts.dt.tz_convert("UTC").dt.tz_localize(None) if ts.dt.tz is not None else ts
        df["time"] = naive.values.astype("datetime64[s]").astype("int64")
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    return df[["time", "open", "high", "low", "close", "volume"]]


# --- MCP response parsing ---------------------------------------------------
def parse_mcp_ohlcv(payload: dict) -> pd.DataFrame | None:
    """Parse BOTH return shapes of data_get_ohlcv into a normalized frame.

    Full bars shape:  {success, bar_count, total_available, source, bars:[...]}
    Summary shape:    {success, bar_count, period, open, close, high, low, ...,
                       last_5_bars:[...]}
    Failure envelope: {success:false, error}

    Returns None on failure or empty. Bars oldest->newest.
    """
    if not payload or payload.get("success") is False:
        return None
    if not payload.get("success", True):
        return None
    bars = payload.get("bars")
    if bars:
        df = pd.DataFrame(bars)
        df = df[["time", "open", "high", "low", "close", "volume"]]
        df["time"] = pd.to_numeric(df["time"], errors="coerce").astype("int64")
        for c in ("open", "high", "low", "close", "volume"):
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
        df["volume"] = df["volume"].fillna(0.0)
        return df.sort_values("time").reset_index(drop=True)
    # Summary fallback (last_5_bars). Limited but better than nothing.
    last5 = payload.get("last_5_bars")
    if last5:
        df = pd.DataFrame(last5)
        df = df[["time", "open", "high", "low", "close", "volume"]]
        df["time"] = pd.to_numeric(df["time"], errors="coerce").astype("int64")
        for c in ("open", "high", "low", "close", "volume"):
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
        return df.sort_values("time").reset_index(drop=True)
    return None


# --- TradingView MCP client source (live) ----------------------------------
class TradingViewMCPSource(DataSource):
    """Live source: a Python MCP CLIENT that spawns the node server over stdio.

    The node server is a CDP bridge that needs TradingView Desktop running with
    --remote-debugging-port=9222. We drive it as an unattended client:
      set symbol -> set timeframe -> read OHLCV -> next (serialized).
    """

    def __init__(self, server_path: str | None = None, broker: str | None = None) -> None:
        self.server_path = server_path or settings.tv_server_path
        self.broker = broker or os.environ.get("TRADING_BROKER", "VANTAGE")
        self._proc: asyncio.subprocess.Process | None = None
        self._next_id = 1
        self._lock = asyncio.Lock()
        self._initialized = False

    @property
    def name(self) -> str:
        return "tradingview-mcp"

    async def _ensure(self) -> None:
        if self._proc is not None and self._proc.returncode is None:
            return
        # Spawn the node MCP server.
        self._proc = await asyncio.create_subprocess_exec(
            "node", self.server_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        # MCP initialize handshake.
        await self._call("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "trading-scanner", "version": "1.0"},
        })
        self._initialized = True

    async def _call(self, method: str, params: dict | None = None) -> dict:
        """Send one JSON-RPC request over stdio and read one response."""
        await self._ensure()
        assert self._proc and self._proc.stdin and self._proc.stdout
        req_id = self._next_id
        self._next_id += 1
        msg = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}
        data = json.dumps(msg).encode()
        header = f"Content-Length: {len(data)}\r\n\r\n".encode()
        async with self._lock:
            self._proc.stdin.write(header + data)
            await self._proc.stdin.drain()
            return await self._read_response(req_id)

    async def _call_tool(self, name: str, args: dict) -> dict:
        return await self._call("tools/call", {"name": name, "arguments": args})

    async def _read_response(self, req_id: int, timeout: float = 30.0) -> dict:
        """Read framed JSON-RPC responses until we see ours."""
        assert self._proc and self._proc.stdout
        buf = b""
        while True:
            try:
                chunk = await asyncio.wait_for(self._proc.stdout.read(4096), timeout=timeout)
            except asyncio.TimeoutError:
                raise RuntimeError(f"MCP response timeout (id={req_id})")
            if not chunk:
                raise RuntimeError("MCP server closed stdout")
            buf += chunk
            while b"\r\n\r\n" in buf:
                head, rest = buf.split(b"\r\n\r\n", 1)
                cl = _content_length(head)
                if cl is None or len(rest) < cl:
                    break  # need more bytes
                body = rest[:cl]
                buf = rest[cl:]
                msg = json.loads(body.decode())
                if msg.get("id") == req_id:
                    return msg
                # notifications / other ids: keep reading

    async def get_ohlcv(self, symbol: str, timeframe: str, bars: int) -> OHLCV | None:
        tf = TIMEFRAMES.get(timeframe, timeframe)
        async with self._lock:
            await self._call_tool("chart_set_symbol", {"symbol": f"{self.broker}:{symbol}"})
            await self._call_tool("chart_set_timeframe", {"timeframe": tf})
            resp = await self._call_tool("data_get_ohlcv",
                                         {"count": min(bars, 500), "summary": False})
        payload = _unwrap_tool_result(resp)
        df = parse_mcp_ohlcv(payload)
        if df is None or df.empty:
            return None
        return OHLCV(df=df)

    async def health(self) -> dict:
        """Call tv_health_check to verify the CDP/TradingView link."""
        try:
            resp = await self._call_tool("tv_health_check", {})
            return _unwrap_tool_result(resp)
        except Exception as e:  # noqa: BLE001
            return {"success": False, "error": str(e)}

    async def close(self) -> None:
        if self._proc and self._proc.returncode is None:
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except Exception:  # noqa: BLE001
                self._proc.kill()
        self._proc = None


def _content_length(head: bytes) -> int | None:
    for line in head.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            try:
                return int(line.split(b":", 1)[1].strip())
            except ValueError:
                return None
    return None


def _unwrap_tool_result(resp: dict) -> dict:
    """An MCP tools/call response wraps the payload in content[].text (JSON)."""
    result = resp.get("result") or {}
    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if item.get("type") == "text":
                try:
                    return json.loads(item["text"])
                except (json.JSONDecodeError, KeyError):
                    continue
    if isinstance(result, dict) and ("bars" in result or "success" in result):
        return result
    return {}
