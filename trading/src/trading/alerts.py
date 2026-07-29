"""Alerts: Telegram + outbound webhook, fired on STATE TRANSITIONS only.

Reuses TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from the marketing OS env so there
is one bot for the whole system.
"""
from __future__ import annotations

import asyncio
import json
import logging

import httpx

from .config import settings

log = logging.getLogger("trading.alerts")


def _dir_label(direction: int) -> str:
    if direction > 0:
        return "USD UP"
    if direction < 0:
        return "USD DOWN"
    return "no consensus"


async def send_telegram(text: str) -> None:
    token, chat = settings.telegram_bot_token, settings.telegram_chat_id
    if not token or not chat:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(url, json={"chat_id": chat, "text": text,
                                        "parse_mode": "Markdown", "disable_web_page_preview": True})
            if r.status_code >= 300:
                log.warning("telegram non-2xx: %s %s", r.status_code, r.text[:200])
    except Exception as e:  # noqa: BLE001
        log.warning("telegram send failed: %s", e)


async def send_webhook(payload: dict) -> None:
    url = settings.webhook_url
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(url, json=payload)
    except Exception as e:  # noqa: BLE001
        log.warning("webhook send failed: %s", e)


async def fire_transitions(transitions: list[tuple[str, str, str]],
                           snapshot) -> None:  # snapshot: scoring.Snapshot
    """Fire one alert per genuine state transition."""
    if not transitions:
        return
    header = f"*Lead/Lag* — {_dir_label(snapshot.usd_direction)} " \
             f"(conf {snapshot.usd_confidence:.2f})"
    lines = [header]
    for symbol, old, new in transitions:
        star = " <- BEST LAG" if symbol == snapshot.best_lag_symbol else ""
        lines.append(f"• `{symbol}` {old} -> *{new}*{star}")
    await send_telegram("\n".join(lines))
    await send_webhook({
        "type": "trading.transitions",
        "usd_direction": snapshot.usd_direction,
        "usd_confidence": snapshot.usd_confidence,
        "transitions": [{"symbol": s, "from": o, "to": n} for s, o, n in transitions],
        "best_lag_symbol": snapshot.best_lag_symbol,
        "generated_at": snapshot.generated_at,
    })


def fire_transitions_sync(transitions, snapshot) -> None:
    try:
        asyncio.get_running_loop()
        # inside a loop -> schedule
        asyncio.ensure_future(fire_transitions(transitions, snapshot))
    except RuntimeError:
        asyncio.run(fire_transitions(transitions, snapshot))
