"""Scoring engine: six cumulative factors -> one score + a latched state.

The six factors (per the spec):
  1. BREAK SEQUENCE  — rank of each instrument's most recent EVWMA cross in the
     consensus direction (1st..Nth), with bar index + wall-clock timestamp.
  2. TREND STRENGTH  — few/no line touches over a lookback => strong trend (100%).
  3. LAG DISTANCE     — (close - center) / ATR(14), signed & USD-aligned. The
     further from having broken, the bigger the lag = better candidate.
  4. FAKE-BREAKOUT   — whipsaw flag if the line was crossed both ways in a short
     window (also checked on 1h: a 1h whipsaw invalidates a 15m signal).
  5. USD CONFIRMATION — where the two anchors sit vs their EVWMA (both above /
     both below / split). Disagreement flags a possible fake move.
  6. LEVEL CONTEXT   — range high/low + POC (densest pivot-price bucket). The
     VOLUME VETO turns a level touch into a breakout (not a reversal) when
     relative volume is high at the touch.

All of these combine into ONE score per instrument and ONE latched state. The
state is latched: it does not change tick-to-tick. Only a genuine direction flip
(the consensus direction reversing) may reset it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np
import pandas as pd

from . import config
from .evwma import (
    EvwmaResult,
    compute_evwma,
    is_whipsaw,
    last_break,
    trend_strength,
)

# --- Per-instrument computed inputs ----------------------------------------
@dataclass
class InstrumentFeatures:
    symbol: str
    primary: EvwmaResult          # 15m
    primary_df: pd.DataFrame
    context: EvwmaResult | None   # 1h
    context_df: pd.DataFrame | None
    invert: bool                  # USD alignment


@dataclass
class BreakRank:
    rank: int                  # 1-based; 0 means "not broken"
    bar_index: int
    time: float                # unix sec of the cross
    direction: int             # +1 up / -1 down (USD-aligned)


@dataclass
class Factors:
    symbol: str
    # 1
    break_rank: BreakRank
    # 2
    trend_strength_pct: float
    # 3 (USD-aligned; positive = lagging the up move, negative = lagging down)
    lag_distance: float
    direction: int             # USD-aligned consensus direction (+1/-1)
    # 4
    whipsaw: bool
    whipsaw_1h: bool
    # 5
    usd_state: str             # "both_above" | "both_below" | "split"
    # 6
    range_high: float
    range_low: float
    poc: float | None
    volume_veto: bool
    # composite
    score: float = 0.0
    state: str = config.WAITING
    is_best_lag: bool = False
    flags: list[str] = field(default_factory=list)


def _usd_aligned(value: float, invert: bool) -> float:
    """Invert USD-base pairs so all instruments share one USD direction."""
    return -value if invert else value


def _poc(prices: Sequence[float], buckets: int = 100) -> float | None:
    """POC = the price bucket holding the most values (smooth +/-2 buckets)."""
    arr = np.asarray(prices, dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) == 0:
        return None
    if len(arr) == 1:
        return float(arr[0])
    lo, hi = float(arr.min()), float(arr.max())
    if hi <= lo:
        return float(arr[0])
    edges = np.linspace(lo, hi, buckets + 1)
    counts, _ = np.histogram(arr, bins=edges)
    # triangular smoothing +/-2 buckets
    kernel = np.array([1, 2, 3, 2, 1])
    padded = np.pad(counts, 2, mode="constant")
    smoothed = np.convolve(padded, kernel, mode="valid")
    dense = int(np.argmax(smoothed))
    center_edge = edges[dense] + (edges[dense + 1] - edges[dense]) / 2
    return float(center_edge)


def _level_volume_veto(primary: EvwmaResult, primary_df: pd.DataFrame,
                       poc: float | None, range_high: float, range_low: float) -> bool:
    """Volume veto: high relative volume when a level is touched => breakout,
    not a reversal. We approximate 'high relative volume' as the last bar's
    volume exceeding ~1.5x its rolling mean, AND price is near a level."""
    if poc is None or len(primary_df) == 0:
        return False
    vol = primary_df["volume"].astype(float)
    if len(vol) < 48:
        return False
    last_close = float(primary_df["close"].iloc[-1])
    last_vol = float(vol.iloc[-1])
    mean_vol = float(vol.iloc[-48:].mean()) or 1.0
    near_level = (abs(last_close - poc) / max(abs(poc), 1e-9) < 0.0025
                  or abs(last_close - range_high) / max(abs(range_high), 1e-9) < 0.0025
                  or abs(last_close - range_low) / max(abs(range_low), 1e-9) < 0.0025)
    return near_level and (last_vol / mean_vol) >= 1.5


def compute_factors(features: InstrumentFeatures, consensus_dir: int) -> Factors:
    """Compute all six factors for one instrument, given the consensus USD
    direction (+1 or -1). The break sequence rank is assigned later in
    `score_all` once all instruments are computed."""
    p = features.primary
    df = features.primary_df

    # 1. Break sequence — most recent cross in the consensus direction.
    br = last_break(p, df, direction=consensus_dir)
    if br is None:
        # No cross in this direction yet: it hasn't broken -> biggest lag.
        break_rank = BreakRank(rank=0, bar_index=-1, time=0.0, direction=consensus_dir)
    else:
        break_rank = BreakRank(rank=1, bar_index=br.bar_index, time=br.time, direction=br.direction)

    # 2. Trend strength.
    ts = trend_strength(p)

    # 3. Lag distance (USD-aligned). Close vs EVWMA center, in ATR units.
    last_close = float(df["close"].iloc[-1])
    last_center = float(p.center.iloc[-1])
    atr = p.atr.iloc[-1]
    atr = float(atr) if atr == atr and atr > 0 else (last_close * 0.001)  # fallback
    raw_lag = (last_close - last_center) / atr
    # In the consensus direction, the LAGGER has NOT yet crossed, so its lag is
    # opposite to the direction. Express lag_distance as "distance still to go"
    # in the consensus direction (always >= 0 for a clean lagger).
    lag_distance = raw_lag if consensus_dir < 0 else -raw_lag
    lag_distance = _usd_aligned(lag_distance, features.invert)
    # Re-sign so that a positive lag = lagging the up move regardless of invert.
    # (lag_distance already USD-aligned above; keep magnitude.)

    # 4. Fake-breakout warning.
    whipsaw = bool(is_whipsaw(p))
    whipsaw_1h = bool(is_whipsaw(features.context)) if features.context is not None else False

    # 5. USD confirmation handled at the group level; placeholder per-instrument.
    usd_state = "split"

    # 6. Level context.
    range_high = float(df["high"].max())
    range_low = float(df["low"].min())
    # POC over swing pivots (use closes as a robust proxy when pivots are sparse).
    poc = _poc(df["close"].tolist())

    veto = _level_volume_veto(p, df, poc, range_high, range_low)

    flags: list[str] = []
    if whipsaw:
        flags.append("whipsaw")
    if whipsaw_1h:
        flags.append("1h-whipsaw")
    if veto:
        flags.append("volume-veto")

    return Factors(
        symbol=features.symbol,
        break_rank=break_rank,
        trend_strength_pct=ts,
        lag_distance=round(lag_distance, 3),
        direction=consensus_dir,
        whipsaw=whipsaw,
        whipsaw_1h=whipsaw_1h,
        usd_state=usd_state,
        range_high=round(range_high, 5),
        range_low=round(range_low, 5),
        poc=round(poc, 5) if poc is not None else None,
        volume_veto=veto,
        flags=flags,
    )


def _anchor_state(features_map: dict[str, InstrumentFeatures]) -> str:
    """Where the two USD anchors sit vs their EVWMA (on 15m)."""
    above = []
    for sym in config.USD_ANCHORS:
        f = features_map.get(sym)
        if f is None or len(f.primary_df) == 0:
            return "split"
        close = float(f.primary_df["close"].iloc[-1])
        center = float(f.primary.center.iloc[-1])
        # Anchors are USD-base; "above" in raw terms means USD weak in common dir.
        above.append(close > center)
    if all(above):
        return "both_above"
    if not any(above):
        return "both_below"
    return "split"


def _usd_direction(features_map: dict[str, InstrumentFeatures]) -> int:
    """Derive the consensus USD direction from the anchors.

    USDCAD/USDCHF are USD-base. If both are BELOW their EVWMA (USD weak), the
    common USD direction is DOWN (-1). If both ABOVE, USD is UP (+1). Split
    => no consensus (0) => everyone stays WAITING.
    """
    state = _anchor_state(features_map)
    if state == "both_below":
        return -1  # USD weak
    if state == "both_above":
        return 1   # USD strong
    return 0


@dataclass
class Snapshot:
    generated_at: float                        # unix sec
    usd_direction: int                         # +1/-1/0
    usd_state: str                             # anchor summary
    usd_confidence: float                      # 0..1
    consensus_dir: int
    rows: list[Factors]
    best_lag_symbol: str | None = None


def score_all(features_map: dict[str, InstrumentFeatures]) -> Snapshot:
    """Compute factors for all instruments, rank the break sequence, combine
    into one score per instrument, and assign the latched state."""
    import time as _t
    consensus_dir = _usd_direction(features_map)
    usd_state = _anchor_state(features_map)
    usd_confidence = 1.0 if consensus_dir != 0 else 0.4

    factors = {sym: compute_factors(feat, consensus_dir if consensus_dir != 0 else 1)
               for sym, feat in features_map.items()}

    # 1. Rank the break sequence: order by cross time ascending (earliest = 1st).
    if consensus_dir != 0:
        broken = [(sym, f.break_rank.time) for sym, f in factors.items() if f.break_rank.rank > 0]
        broken.sort(key=lambda x: x[1])
        for rank, (sym, _) in enumerate(broken, start=1):
            factors[sym].break_rank.rank = rank

    # Composite score: reward being the lagger (low rank number is leader; high
    # lag_distance is lagger). Score = weighted blend, higher = better candidate.
    max_lag = max((abs(f.lag_distance) for f in factors.values()), default=1.0) or 1.0
    for f in factors.values():
        # Lagger traits: not first to break (rank high or 0) + large lag distance
        # + strong trend + no whipsaw. Higher score = better LAG candidate.
        rank_norm = (f.break_rank.rank / max(len(factors), 1)) if f.break_rank.rank > 0 else 1.0
        lag_norm = abs(f.lag_distance) / max_lag
        trend_norm = f.trend_strength_pct / 100.0
        penalty = 0.25 if (f.whipsaw or f.whipsaw_1h) else 0.0
        f.score = round(
            100.0 * (0.40 * rank_norm + 0.35 * lag_norm + 0.25 * trend_norm) * (1 - penalty),
            1,
        )

    # Best LAG candidate: highest score among non-leaders with no fatal whipsaw.
    candidates = [f for f in factors.values() if not (f.whipsaw and f.whipsaw_1h)]
    best = max(candidates, key=lambda f: f.score, default=None)
    best_sym = None
    if best is not None and best.score > 0:
        best.is_best_lag = True
        best_sym = best.symbol

    # Assign states (caller applies latching via Latch on top of this).
    n_broken = sum(1 for f in factors.values() if f.break_rank.rank > 0)
    for f in factors.values():
        if consensus_dir == 0:
            f.state = config.WAITING
        elif f.whipsaw and f.whipsaw_1h:
            f.state = config.FADE_LEADER
        elif n_broken >= 3 and f.symbol == best_sym:
            f.state = config.LAG_OPPORTUNITY
        elif n_broken >= 2:
            f.state = config.TREND_CONFIRMED
        elif n_broken >= 1:
            f.state = config.LEADER_BREAK if f.break_rank.rank == 1 else config.WAITING
        else:
            f.state = config.WAITING

    rows = list(factors.values())
    return Snapshot(
        generated_at=_t.time(),
        usd_direction=consensus_dir,
        usd_state=usd_state,
        usd_confidence=round(usd_confidence, 2),
        consensus_dir=consensus_dir,
        rows=rows,
        best_lag_symbol=best_sym,
    )


# --- Latch -----------------------------------------------------------------
# A setup latches: it must not change its mind tick to tick. Only a genuine
# direction flip (consensus_dir sign reversal) may reset the latch.
class Latch:
    def __init__(self) -> None:
        self._state: dict[str, str] = {}
        self._direction: int = 0

    def update(self, snapshot: Snapshot) -> list[tuple[str, str, str]]:
        """Apply latching. Returns [(symbol, old_state, new_state), ...] for
        instruments whose state actually changed (transitions)."""
        transitions: list[tuple[str, str, str]] = []
        # Direction flip resets everything.
        new_dir = snapshot.consensus_dir
        reset = (new_dir != 0 and self._direction != 0 and new_dir != self._direction)
        if reset or new_dir == 0:
            # On flip or loss of consensus, all setups clear.
            for sym, f in zip([r.symbol for r in snapshot.rows], snapshot.rows):
                old = self._state.get(sym, config.WAITING)
                new = config.WAITING if new_dir == 0 else f.state
                if reset and new_dir != 0:
                    new = f.state  # fresh setup in the new direction
                self._state[sym] = new
                if old != new:
                    transitions.append((sym, old, new))
            self._direction = new_dir
            return transitions

        # Same direction: only advance, never retreat down the sequence.
        order = {
            config.WAITING: 0,
            config.LEADER_BREAK: 1,
            config.TREND_CONFIRMED: 2,
            config.LAG_OPPORTUNITY: 3,
            config.FADE_LEADER: 2,
        }
        for f in snapshot.rows:
            old = self._state.get(f.symbol, config.WAITING)
            new = f.state
            # FADE_LEADER is a distinct branch, always allowed.
            if new == config.FADE_LEADER:
                if old != new:
                    self._state[f.symbol] = new
                    transitions.append((f.symbol, old, new))
                continue
            if order.get(new, 0) >= order.get(old, 0):
                if old != new:
                    self._state[f.symbol] = new
                    transitions.append((f.symbol, old, new))
            # else: would retreat -> latched, ignore.
        self._direction = new_dir
        return transitions

    def latched_state(self, symbol: str) -> str:
        return self._state.get(symbol, config.WAITING)
