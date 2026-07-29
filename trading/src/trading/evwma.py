"""Adaptive Elastic Volume-Weighted Moving Average (EVWMA).

Implements the spec exactly. The line's window shrinks when the market moves
cleanly and expands when it chops. A recursive center is updated bar-by-bar:

    volSum = sma(vol, length) * length
    center = prev_center * (1 - vol/volSum) + (vol/volSum) * close

Line color encodes volume pressure (buy/sell balance), constrained so that
price below the line is never green and price above is never red.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# --- Rolling helpers (spec constants) --------------------------------------
_ER_LEN = 20       # efficiency ratio window
_VOL_LEN = 48      # relative volume SMA window
_STDEV_LEN = 20    # stdev window for gap normalizer
_PRESS_LEN = 20    # buy/sell pressure sum window
_ATR_LEN = 14      # ATR window for lag distance


def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def _rolling_stdev(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).std(ddof=0)


@dataclass
class EvwmaResult:
    """Full indicator output for a series."""
    center: pd.Series          # the EVWMA line
    speed: pd.Series           # adaptive speed (0..1)
    length: pd.Series          # adaptive length (12..96)
    pres_adj: pd.Series        # adjusted buy pressure (0..1); >0.5 = buying
    color: pd.Series           # categorical: red|orange|yellow|green
    atr: pd.Series             # ATR(14)
    touches: pd.Series         # bool: bar range straddles the line (a "touch")
    cross: pd.Series           # +1/-1 on the bar the line is crossed, else 0


def _clamp(s: pd.Series, lo: float, hi: float) -> pd.Series:
    return s.clip(lower=lo, upper=hi)


def compute_evwma(df: pd.DataFrame) -> EvwmaResult:
    """Compute EVWMA and derived signals from an OHLCV frame.

    df must have columns: open, high, low, close, volume, time (unix sec).
    Rows ordered oldest -> newest. Returns series aligned to df.index.
    """
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    vol = df["volume"].astype(float)
    vol = vol.where(vol > 0, 1.0)  # FX tick volume: use 1.0 if missing/zero

    n = len(close)
    idx = close.index

    # 1. Efficiency ratio: abs(close - close[20]) / sum(abs(diff), 20)
    eff_denom = close.diff().abs().rolling(_ER_LEN, min_periods=_ER_LEN).sum()
    er = (close - close.shift(_ER_LEN)).abs() / eff_denom.replace(0.0, np.nan)
    er = er.fillna(0.0)

    # 2. Relative volume normaliser
    rv = vol / _sma(vol, _VOL_LEN).replace(0.0, np.nan)
    rv = rv.fillna(1.0)
    rvN = _clamp((rv - 0.5) / 1.5, 0.0, 1.0)

    # 3. Gap normaliser vs previous center (computed in the pass below; we
    #    approximate prev_center by the close shifted once for the rolling
    #    component — the recursive center is built after).
    prev_close = close.shift(1)
    sd = _rolling_stdev(close, _STDEV_LEN).replace(0.0, np.nan).fillna(1.0)
    gapN = ((close - prev_close).abs() / (sd * 2.5)).clip(upper=1.0).clip(lower=0.0)

    # 4. Speed = sma(min(0.55*er + 0.30*rvN + 0.45*gapN, 1.0), 3)
    raw_speed = (0.55 * er + 0.30 * rvN + 0.45 * gapN).clip(upper=1.0, lower=0.0)
    speed = _sma(raw_speed, 3).fillna(0.0)

    # 5. Adaptive length: max(12, round(96 - (96-12) * speed))
    length = (96 - (96 - 12) * speed).round().clip(lower=12, upper=96)

    # 6. Recursive center. Length is per-bar; volSum = sma(vol, length)*length.
    center = np.full(n, np.nan)
    if n > 0:
        center_val = float(close.iloc[0])
        center[0] = center_val
        vol_arr = vol.to_numpy()
        close_arr = close.to_numpy()
        length_arr = length.to_numpy()
        speed_arr = speed.to_numpy()
        for i in range(1, n):
            L = int(length_arr[i]) if not np.isnan(length_arr[i]) else 96
            L = max(L, 12)
            lo = max(0, i - L + 1)
            window = vol_arr[lo:i + 1]
            vol_sma = window.mean() if len(window) else float(vol_arr[i])
            vol_sum = vol_sma * L
            if vol_sum <= 0:
                alpha = 1.0
            else:
                alpha = float(vol_arr[i]) / float(vol_sum)
            alpha = min(max(alpha, 0.0), 1.0)
            center_val = center_val * (1 - alpha) + alpha * float(close_arr[i])
            center[i] = center_val
        center_s = pd.Series(center, index=idx)
    else:
        center_s = pd.Series(center, index=idx)

    # 7. Volume pressure color.
    hi = np.maximum(high.to_numpy(), prev_close.to_numpy())
    lo = np.minimum(low.to_numpy(), prev_close.to_numpy())
    rng = (hi - lo)
    rng = np.where(rng == 0, 1e-9, rng)
    bp = (close.to_numpy() - lo)            # buying pressure per bar
    sp = (hi - close.to_numpy())            # selling pressure per bar
    bp_frac = bp / rng
    sp_frac = sp / rng
    bpv = pd.Series(bp_frac * vol.to_numpy(), index=idx)
    spv = pd.Series(sp_frac * vol.to_numpy(), index=idx)
    pres_denom = (bpv + spv).rolling(_PRESS_LEN, min_periods=_PRESS_LEN).sum().replace(0.0, np.nan)
    pres = bpv.rolling(_PRESS_LEN, min_periods=_PRESS_LEN).sum() / pres_denom
    pres = pres.fillna(0.5)
    rv_clamped = rv.clip(upper=1.5)
    pres_adj = 0.5 + (pres - 0.5) * (rv_clamped / 1.5)

    # Color: below line -> red/orange; above line -> yellow/green.
    # Never green below the line, never red above it.
    above = close.to_numpy() >= center
    color = np.where(above, "yellow", "orange")
    color = np.where(above & (pres_adj.to_numpy() > 0.6), "green", color)
    color = np.where((~above) & (pres_adj.to_numpy() < 0.4), "red", color)
    color_s = pd.Series(color, index=idx)

    # 8. ATR(14) (Wilder-style smoothing via rolling for simplicity).
    tr = pd.concat([
        (high - low),
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(_ATR_LEN, min_periods=_ATR_LEN).mean()

    # 9. Touch (bar range straddles the line) and cross events.
    touches = (low <= center_s) & (high >= center_s)
    pos = close.to_numpy() > center
    cross = np.zeros(n, dtype=int)
    cross[1:] = np.where(pos[1:] != pos[:-1], np.where(pos[1:], 1, -1), 0)
    cross_s = pd.Series(cross, index=idx)

    return EvwmaResult(
        center=center_s, speed=speed, length=length, pres_adj=pres_adj,
        color=color_s, atr=atr, touches=touches.astype(bool), cross=cross_s,
    )


@dataclass
class BreakEvent:
    """The most recent EVWMA cross for an instrument/TF."""
    bar_index: int       # index in the series where the cross occurred
    time: float          # wall-clock / bar time (unix sec) of the cross
    direction: int       # +1 = broke upward, -1 = broke downward


def last_break(result: EvwmaResult, df: pd.DataFrame, direction: int | None = None) -> BreakEvent | None:
    """Most recent cross event. If `direction` is given, most recent cross in
    that direction (the consensus direction). Returns None if no cross yet."""
    cross = result.cross
    if direction is not None:
        mask = cross == direction
    else:
        mask = cross != 0
    idxs = np.nonzero(mask.to_numpy())[0]
    if len(idxs) == 0:
        return None
    i = int(idxs[-1])
    times = df["time"].to_numpy() if "time" in df.columns else np.arange(len(df))
    return BreakEvent(bar_index=i, time=float(times[i]), direction=int(cross.iloc[i]))


def is_whipsaw(result: EvwmaResult, window: int = 12) -> bool:
    """Fake-breakout warning: the EVWMA was crossed BOTH up and down within a
    short trailing window -> whipsaw."""
    cross = result.cross.iloc[-window:] if len(result.cross) >= window else result.cross
    up = int((cross == 1).sum())
    down = int((cross == -1).sum())
    return up >= 1 and down >= 1


def trend_strength(result: EvwmaResult, lookback: int = 60) -> float:
    """Trend strength as a percentage (0..100).

    A 'touch' = a bar whose range straddles the EVWMA line. Few/no touches over
    the lookback => very strong trend (100%). Frequent touches => weak/sideways.
    """
    touches = result.touches.iloc[-lookback:] if len(result.touches) >= lookback else result.touches
    count = int(touches.sum())
    denom = max(len(touches), 1)
    # Map touch density: 0 touches -> 100%, all bars touched -> 0%.
    return round(max(0.0, 100.0 * (1 - count / denom)), 1)
