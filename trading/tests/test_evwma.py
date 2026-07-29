"""Engine correctness tests for evwma.py — small deterministic fixtures."""
from __future__ import annotations

import numpy as np
import pandas as pd

from trading.evwma import compute_evwma, is_whipsaw, last_break, trend_strength


def _df(closes, highs=None, lows=None, vols=None, start=1_700_000_000, step=900):
    n = len(closes)
    highs = highs if highs is not None else [c + 0.001 for c in closes]
    lows = lows if lows is not None else [c - 0.001 for c in closes]
    vols = vols if vols is not None else [1000.0] * n
    return pd.DataFrame({
        "time": [start + i * step for i in range(n)],
        "open": closes, "high": highs, "low": lows, "close": closes, "volume": vols,
    })


def test_center_follows_close_in_clean_trend():
    """In a steady uptrend the EVWMA center rises and stays below price."""
    closes = [1.0 + i * 0.01 for i in range(120)]
    df = _df(closes)
    res = compute_evwma(df)
    # After warmup, center must be monotonically rising.
    tail = res.center.dropna().iloc[-30:]
    assert tail.is_monotonic_increasing
    # And price above center in a clean uptrend.
    assert (df["close"].iloc[-1] > res.center.iloc[-1])


def test_length_bounds_are_respected():
    closes = [1.0 + i * 0.01 for i in range(120)]
    res = compute_evwma(_df(closes))
    L = res.length.dropna()
    assert (L >= 12).all() and (L <= 96).all()


def test_speed_in_unit_interval():
    rng = np.random.default_rng(42)
    closes = list(1.0 + rng.standard_normal(150).cumsum() * 0.01)
    res = compute_evwma(_df(closes))
    s = res.speed.dropna()
    assert (s >= 0).all() and (s <= 1).all()


def test_cross_detected_on_direction_change():
    """Crossing the line from below to above yields a +1 cross event."""
    closes = [1.0] * 60 + [1.0 + i * 0.02 for i in range(1, 60)]  # flat then up
    res = compute_evwma(_df(closes))
    assert (res.cross == 1).any()  # at least one up-cross
    br = last_break(res, _df(closes), direction=1)
    assert br is not None and br.direction == 1


def test_color_never_green_below_line():
    """Spec invariant: price below center must never be green."""
    rng = np.random.default_rng(7)
    closes = list(1.0 + rng.standard_normal(150).cumsum() * 0.01)
    df = _df(closes)
    res = compute_evwma(df)
    below = df["close"] < res.center
    bad = (res.color == "green") & below
    assert not bad.any()


def test_color_never_red_above_line():
    rng = np.random.default_rng(9)
    closes = list(1.0 + rng.standard_normal(150).cumsum() * 0.01)
    df = _df(closes)
    res = compute_evwma(df)
    above = df["close"] >= res.center
    bad = (res.color == "red") & above
    assert not bad.any()


def test_trend_strength_extremes():
    # Strong trend: price ramps hard, few touches -> high strength.
    strong = [1.0 + i * 0.03 for i in range(120)]
    s_strong = trend_strength(compute_evwma(_df(strong)))
    # Choppy: oscillating around a level -> low strength.
    choppy = [1.0 + (i % 4 - 2) * 0.01 for i in range(120)]
    s_choppy = trend_strength(compute_evwma(_df(choppy)))
    assert s_strong > s_choppy
    assert 0 <= s_strong <= 100 and 0 <= s_choppy <= 100


def test_whipsaw_flag():
    """Crossing up then down in a short window triggers whipsaw."""
    closes = [1.0] * 20 + [1.05] * 6 + [0.95] * 6 + [1.0] * 6
    res = compute_evwma(_df(closes))
    assert is_whipsaw(res, window=20)


def test_volume_zero_treated_as_one():
    """FX tick volume may be 0; the indicator must not NaN out."""
    closes = [1.0 + i * 0.01 for i in range(120)]
    df = _df(closes, vols=[0.0] * 120)
    res = compute_evwma(df)
    assert res.center.dropna().shape[0] > 0
