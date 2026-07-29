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
import logging
import os
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass

import pandas as pd

from .config import TIMEFRAMES, settings

log = logging.getLogger("trading.data_source")


@dataclass
class OHLCV:
    df: pd.DataFrame  # columns: time, open, high, low, close, volume (oldest->newest)


class DataSource(ABC):
    """Swappable data interface consumed by the scoring engine."""

    @abstractmethod
    async def get_ohlcv(self, symbol: str, timeframe: str, bars: int,
                        quote: str | None = None) -> OHLCV | None: ...

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

    async def get_ohlcv(self, symbol: str, timeframe: str, bars: int,
                        quote: str | None = None) -> OHLCV | None:
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

    Uses the official `mcp` SDK client (handles the JSON-RPC framing, the
    initialize + notifications/initialized handshake, and result unwrapping),
    which is far more robust than hand-rolling the stdio protocol.
    """

    def __init__(self, server_path: str | None = None, broker: str | None = None) -> None:
        self.server_path = server_path or settings.tv_server_path
        self.broker = broker or os.environ.get("TRADING_BROKER", "VANTAGE")
        self._params = None  # StdioServerParameters
        self._cm_stack: asyncio.AsyncContextManager | None = None
        self._session = None  # mcp.ClientSession
        self._lock = asyncio.Lock()

    @property
    def name(self) -> str:
        return "tradingview-mcp"

    async def _ensure(self) -> "ClientSession":  # type: ignore[name-defined]
        """Lazily spawn the server + open + initialize a client session."""
        if self._session is not None:
            return self._session
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
        self._params = StdioServerParameters(
            command="node", args=[self.server_path])
        # stdio_client + ClientSession are async context managers; we enter them
        # manually so the session lives across multiple calls.
        self._stdio_cm = stdio_client(self._params)
        read, write = await self._stdio_cm.__aenter__()
        self._session_cm = ClientSession(read, write)
        self._session = await self._session_cm.__aenter__()
        await self._session.initialize()
        return self._session

    async def _call_tool(self, name: str, args: dict) -> dict:
        """Call a tool and unwrap its content[].text JSON into a dict."""
        session = await self._ensure()
        result = await session.call_tool(name, args)
        return _unwrap_tool_result(result)

    async def get_ohlcv(self, symbol: str, timeframe: str, bars: int,
                       quote: str | None = None, timeout: float = 40.0) -> OHLCV | None:
        """Fetch OHLCV. `quote` is the full EXCHANGE:TICKER; when omitted we
        build <broker>:<symbol> for backward compatibility.

        `timeout` caps the whole symbol+tf read so one stuck chart-switch on the
        shared CDP bridge can't stall an entire sweep — it's skipped instead.
        """
        tf = TIMEFRAMES.get(timeframe, timeframe)
        tv_symbol = quote or f"{self.broker}:{symbol}"
        async with self._lock:
            try:
                async def _read():
                    await self._call_tool("chart_set_symbol", {"symbol": tv_symbol})
                    await self._call_tool("chart_set_timeframe", {"timeframe": tf})
                    return await self._call_tool("data_get_ohlcv",
                                                 {"count": min(bars, 500), "summary": False})
                payload = await asyncio.wait_for(_read(), timeout=timeout)
            except asyncio.TimeoutError:
                log.warning("MCP get_ohlcv(%s, %s) timed out after %ss (chart busy?)",
                            tv_symbol, timeframe, timeout)
                # Recycle the session so the next call reconnects cleanly.
                await self._recycle()
                return None
            except Exception as e:  # noqa: BLE001
                log.warning("MCP get_ohlcv(%s, %s) failed: %s", tv_symbol, timeframe, e)
                return None
        df = parse_mcp_ohlcv(payload)
        if df is None or df.empty:
            return None
        return OHLCV(df=df)

    async def _recycle(self) -> None:
        """Drop the current MCP session so the next call re-initializes."""
        try:
            await self.close()
        except Exception:  # noqa: BLE001
            pass

    async def health(self) -> dict:
        """Call tv_health_check to verify the CDP/TradingView link."""
        try:
            return await self._call_tool("tv_health_check", {})
        except Exception as e:  # noqa: BLE001
            return {"success": False, "error": str(e)}

    async def close(self) -> None:
        # Exit the context managers in reverse order; tolerate partial states.
        for cm_attr in ("_session_cm", "_stdio_cm"):
            cm = getattr(self, cm_attr, None)
            if cm is None:
                continue
            try:
                await cm.__aexit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass
        self._session = None
        self._session_cm = None
        self._stdio_cm = None


def _unwrap_tool_result(result) -> dict:
    """An MCP tools/call result wraps the payload in content[].text (JSON).

    Accepts either the SDK's CallToolResult object (has .content) or a raw dict.
    """
    content = getattr(result, "content", None)
    if content is None and isinstance(result, dict):
        content = (result.get("result") or {}).get("content")
    if isinstance(content, list):
        for item in content:
            text = item.text if hasattr(item, "text") else item.get("text") if isinstance(item, dict) else None
            if text:
                try:
                    return json.loads(text)
                except (json.JSONDecodeError, TypeError):
                    continue
    if isinstance(result, dict) and ("bars" in result or "success" in result):
        return result
    return {}

