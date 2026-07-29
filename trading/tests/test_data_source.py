"""Data source parser correctness — both MCP OHLCV shapes + failure envelope."""
from __future__ import annotations

import pandas as pd

from trading.data_source import CsvSource, _normalize_columns, parse_mcp_ohlcv


def test_parse_full_bars_shape():
    payload = {
        "success": True,
        "bar_count": 3,
        "total_available": 3,
        "source": "direct_bars",
        "bars": [
            {"time": 1700000000, "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15, "volume": 100},
            {"time": 1700000900, "open": 1.15, "high": 1.25, "low": 1.1, "close": 1.2, "volume": 150},
            {"time": 1700001800, "open": 1.2, "high": 1.3, "low": 1.15, "close": 1.25, "volume": 200},
        ],
    }
    df = parse_mcp_ohlcv(payload)
    assert df is not None
    assert list(df.columns) == ["time", "open", "high", "low", "close", "volume"]
    assert df["time"].iloc[0] == 1700000000  # seconds, not ms
    assert df["close"].iloc[-1] == 1.25
    assert df["time"].is_monotonic_increasing


def test_parse_summary_shape_uses_last_5_bars():
    payload = {
        "success": True,
        "bar_count": 100,
        "period": {"from": 1700000000, "to": 1700009000},
        "open": 1.1, "close": 1.2, "high": 1.3, "low": 1.0,
        "range": 0.3, "change": 0.1, "change_pct": "9.09%",  # string with %
        "avg_volume": 150, "last_5_bars": [
            {"time": 1700008000, "open": 1.18, "high": 1.22, "low": 1.17, "close": 1.19, "volume": 120},
        ],
    }
    df = parse_mcp_ohlcv(payload)
    assert df is not None and len(df) == 1
    assert df["close"].iloc[0] == 1.19


def test_parse_failure_envelope_returns_none():
    payload = {"success": False, "error": "chart loading"}
    assert parse_mcp_ohlcv(payload) is None


def test_parse_empty_returns_none():
    assert parse_mcp_ohlcv({}) is None
    assert parse_mcp_ohlcv({"success": True}) is None


def test_normalize_ms_timestamps_to_seconds():
    df = pd.DataFrame({
        "timestamp": [1700000000000, 1700000900000],  # ms
        "open": [1.0, 1.1], "high": [1.1, 1.2], "low": [0.9, 1.0],
        "close": [1.05, 1.15], "volume": [100, 200],
    })
    out = _normalize_columns(df)
    assert out["time"].iloc[0] == 1700000000  # divided to seconds
    assert out["time"].iloc[1] == 1700000900


def test_normalize_iso_timestamps():
    df = pd.DataFrame({
        "time": ["2023-11-14T22:13:20+00:00", "2023-11-14T22:28:20+00:00"],
        "open": [1.0, 1.1], "high": [1.1, 1.2], "low": [0.9, 1.0],
        "close": [1.05, 1.15], "volume": [100, 200],
    })
    out = _normalize_columns(df)
    assert out["time"].iloc[0] == 1700000000
    assert out["time"].is_monotonic_increasing


def test_csv_source_missing_file_returns_none(capsys):
    import asyncio
    src = CsvSource(data_dir="trading/data")
    out = asyncio.run(src.get_ohlcv("NOPE", "15m", 100))
    assert out is None
