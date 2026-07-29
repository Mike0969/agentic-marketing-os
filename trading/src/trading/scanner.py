"""Scanner: the live sweep loop.

On each 15m bar close, sweep all instruments x {3m, 15m, 1h} through the single
CDP chart (serialized), compute EVWMA per series, score all instruments through
the six-factor engine, latch the state, persist, and fire alerts on transitions.

The scanner is the producer. The FastAPI server (server.py) is the consumer and
pushes snapshots over WebSocket. They share one Scanner instance.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable

import pandas as pd

from . import config
from .alerts import fire_transitions
from .data_source import CsvSource, DataSource, TradingViewMCPSource
from .evwma import compute_evwma
from .scoring import InstrumentFeatures, Latch, Snapshot, score_all
from .store import Store

log = logging.getLogger("trading.scanner")


class Scanner:
    """Holds the latest snapshot + a latch + subscribers (server pushes via WS)."""

    def __init__(self, source: DataSource | None = None, store: Store | None = None,
                 instruments=None, timeframes=None) -> None:
        self.source = source or TradingViewMCPSource()
        self.store = store or Store()
        self.instruments = instruments or config.instruments()
        self.timeframes = timeframes or list(config.TIMEFRAMES.keys())
        self.latch = Latch()
        self.snapshot: Snapshot | None = None
        self._subs: list[Callable[[Snapshot], None]] = []
        self._last_primary_bar: int | None = None

    def subscribe(self, cb: Callable[[Snapshot], None]) -> None:
        self._subs.append(cb)

    def _publish(self, snap: Snapshot) -> None:
        self.snapshot = snap
        for cb in list(self._subs):
            try:
                cb(snap)
            except Exception as e:  # noqa: BLE001
                log.warning("subscriber error: %s", e)

    async def sweep_once(self, persist: bool = True) -> Snapshot | None:
        """One full sweep: fetch all TFs for all instruments, score, latch."""
        features: dict[str, InstrumentFeatures] = {}
        bars = config.settings.ohlcv_bars
        for inst in self.instruments:
            try:
                primary_ohlcv = await self.source.get_ohlcv(inst.symbol, config.PRIMARY_TF, bars)
                context_ohlcv = await self.source.get_ohlcv(inst.symbol, config.CONTEXT_TF, bars)
                # trigger not needed for the score yet; fetched for completeness if cheap.
            except Exception as e:  # noqa: BLE001
                log.warning("fetch failed for %s: %s", inst.symbol, e)
                continue
            if primary_ohlcv is None or primary_ohlcv.df.empty:
                log.info("no data for %s (TV connected?)", inst.symbol)
                continue
            if persist:
                self.store.upsert_ohlcv(inst.symbol, config.PRIMARY_TF, primary_ohlcv.df)
                if context_ohlcv is not None and not context_ohlcv.df.empty:
                    self.store.upsert_ohlcv(inst.symbol, config.CONTEXT_TF, context_ohlcv.df)
            primary = compute_evwma(primary_ohlcv.df)
            context = None
            context_df = None
            if context_ohlcv is not None and not context_ohlcv.df.empty:
                context = compute_evwma(context_ohlcv.df)
                context_df = context_ohlcv.df
            features[inst.symbol] = InstrumentFeatures(
                symbol=inst.symbol, primary=primary, primary_df=primary_ohlcv.df,
                context=context, context_df=context_df, invert=inst.invert)

        if not features:
            log.warning("sweep produced no features (is TradingView connected?)")
            return None

        snap = score_all(features)
        transitions = self.latch.update(snap)

        # Apply latched state onto the snapshot rows for display stability.
        for r in snap.rows:
            r.state = self.latch.latched_state(r.symbol)

        if persist:
            self._persist(snap, transitions)
        if transitions:
            await fire_transitions(transitions, snap)
        self._publish(snap)
        return snap

    def _persist(self, snap: Snapshot, transitions) -> None:
        for r in snap.rows:
            self.store.upsert_state(r.symbol, r.state, r.score, {
                "flags": r.flags, "lag_distance": r.lag_distance,
                "trend_strength_pct": r.trend_strength_pct,
                "break_rank": r.break_rank.rank, "break_time": r.break_rank.time,
                "direction": r.direction, "usd_state": snap.usd_state,
            })
        for sym, old, new in transitions:
            self.store.log_event(snap.generated_at, sym, "transition",
                                 {"from": old, "to": new,
                                  "usd_direction": snap.usd_direction})

    async def _primary_just_closed(self) -> bool:
        """True when the 15m bar has closed since the last check."""
        # Determine the latest closed 15m bar time from the cache/feed.
        # We use EURUSD as the heartbeat; any instrument works.
        inst = self.instruments[0]
        try:
            ohlcv = await self.source.get_ohlcv(inst.symbol, config.PRIMARY_TF, 2)
        except Exception:  # noqa: BLE001
            return False
        if ohlcv is None or ohlcv.df.empty:
            return False
        last = int(ohlcv.df["time"].iloc[-1])
        if self._last_primary_bar is None:
            self._last_primary_bar = last
            return True  # first run
        if last > self._last_primary_bar:
            self._last_primary_bar = last
            return True
        return False

    async def run(self, poll_seconds: int | None = None) -> None:
        """Background loop: re-sweep on 15m bar close (or poll_seconds)."""
        poll = poll_seconds or config.settings.poll_seconds
        log.info("scanner starting (source=%s, poll=%ss)", self.source.name, poll)
        # First sweep immediately so the dashboard has data on boot.
        try:
            await self.sweep_once()
        except Exception as e:  # noqa: BLE001
            log.warning("initial sweep failed: %s", e)
        while True:
            await asyncio.sleep(min(poll, 60))  # wake often enough to catch bar close
            try:
                if await self._primary_just_closed():
                    log.info("15m bar closed -> sweeping")
                    await self.sweep_once()
            except Exception as e:  # noqa: BLE001
                log.warning("sweep error: %s", e)

    async def close(self) -> None:
        await self.source.close()
        self.store.close()


def _build_source(kind: str | None = None) -> DataSource:
    if kind == "csv":
        return CsvSource()
    return TradingViewMCPSource()


def main() -> None:
    import argparse
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description="Lead/lag trading scanner")
    p.add_argument("--source", choices=["mcp", "csv"], default="mcp")
    args = p.parse_args()
    scanner = Scanner(source=_build_source(args.source))
    try:
        asyncio.run(scanner.run())
    except KeyboardInterrupt:
        asyncio.run(scanner.close())


if __name__ == "__main__":
    main()
