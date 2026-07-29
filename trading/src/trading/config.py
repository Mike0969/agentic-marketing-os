"""Configuration: instruments, timeframes, env loading.

Instruments are USD-aligned in the scoring engine: USD-base pairs (USDCAD,
USDCHF) are INVERTED so every instrument expresses one common "USD direction".
USDJPY is intentionally excluded (BOJ policy breaks its correlation).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()

# --- Instruments ------------------------------------------------------------
# symbol: the canonical name used everywhere in the engine.
# quote: the symbol string the broker feed understands (EXCHANGE:TICKER).
# group: asset class, used for correlation grouping / display.
# invert: whether to invert returns/levels to express common USD direction.

@dataclass(frozen=True)
class Instrument:
    symbol: str          # e.g. "EURUSD"
    quote: str           # e.g. "VANTAGE:EURUSD"
    group: str           # "fx" | "metal" | "index"
    invert: bool = False # invert so all instruments share one USD direction


def _q(ticker: str, broker: str | None = None) -> str:
    """Build the broker-prefixed quote symbol. UNVERIFIED prefix — confirm at runtime."""
    b = broker or os.environ.get("TRADING_BROKER", "VANTAGE")
    return f"{b}:{ticker}"


def instruments() -> list[Instrument]:
    broker = os.environ.get("TRADING_BROKER", "VANTAGE")
    raw = [
        # FX majors (not USD-base) — no inversion needed; falling EURUSD = USD up.
        ("EURUSD", "fx", False),
        ("GBPUSD", "fx", False),
        ("AUDUSD", "fx", False),
        ("NZDUSD", "fx", False),
        # USD anchors — USD-base, so invert to the common USD direction.
        ("USDCAD", "fx", True),
        ("USDCHF", "fx", True),
        # Metals (priced in USD; rising = USD down, like EURUSD).
        ("XAUUSD", "metal", False),
        ("XAGUSD", "metal", False),
        # Indices (own dynamics; observed chain Nikkei -> Nasdaq -> S&P -> Dow).
        ("JPN225", "index", False),
        ("NAS100", "index", False),
        ("SP500", "index", False),
        ("DJ30", "index", False),
    ]
    return [Instrument(s, _q(s, broker), g, inv) for s, g, inv in raw]


# The two anchors whose position vs EVWMA drive USD confirmation.
USD_ANCHORS = ("USDCAD", "USDCHF")

# --- Timeframes -------------------------------------------------------------
# primary scanning TF (15m), context TFs (1h), and trigger TF (3m).
# TradingView resolution strings: minute counts.
TIMEFRAMES: dict[str, str] = {
    "3m": "3",    # trigger
    "15m": "15",  # primary
    "1h": "60",   # context / trend strength
}

PRIMARY_TF = "15m"
TRIGGER_TF = "3m"
CONTEXT_TF = "1h"


# --- Env-backed settings ----------------------------------------------------
@dataclass
class Settings:
    tv_server_path: str = field(default_factory=lambda: os.environ.get(
        "TRADING_TV_SERVER_PATH", "/Users/dubai/tradingview-mcp/src/server.js"))
    host: str = field(default_factory=lambda: os.environ.get("TRADING_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.environ.get("TRADING_PORT", "8000")))
    dashboard_url: str = field(default_factory=lambda: os.environ.get(
        "TRADING_DASHBOARD_URL", "http://127.0.0.1:8000"))
    db_path: str = field(default_factory=lambda: os.environ.get(
        "TRADING_DB_PATH", "trading/data/trading.db"))
    poll_seconds: int = field(default_factory=lambda: int(os.environ.get("TRADING_POLL_SECONDS", "900")))
    ohlcv_bars: int = field(default_factory=lambda: int(os.environ.get("TRADING_OHLCV_BARS", "400")))
    telegram_bot_token: str | None = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN"))
    telegram_chat_id: str | None = field(default_factory=lambda: os.environ.get("TELEGRAM_CHAT_ID"))
    webhook_url: str | None = field(default_factory=lambda: os.environ.get("TRADING_WEBHOOK_URL"))

    @property
    def alerts_enabled(self) -> bool:
        return bool(self.telegram_bot_token and self.telegram_chat_id) or bool(self.webhook_url)


# Instrument states (latched state machine).
WAITING = "WAITING"
LEADER_BREAK = "LEADER-BREAK"
TREND_CONFIRMED = "TREND-CONFIRMED"
LAG_OPPORTUNITY = "LAG-OPPORTUNITY"
FADE_LEADER = "FADE-LEADER"

STATES = (WAITING, LEADER_BREAK, TREND_CONFIRMED, LAG_OPPORTUNITY, FADE_LEADER)

settings = Settings()
