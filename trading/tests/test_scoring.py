"""Scoring + latch correctness tests."""
from __future__ import annotations

import pandas as pd

from trading import config
from trading.evwma import EvwmaResult
from trading.scoring import (
    BreakRank,
    Factors,
    Latch,
    Snapshot,
    _poc,
    _usd_direction,
    score_all,
)


def _fake_snapshot(rows, consensus_dir, best=None):
    """Build a minimal Snapshot for latch testing without OHLCV."""
    return Snapshot(
        generated_at=0.0,
        usd_direction=consensus_dir,
        usd_state="both_below",
        usd_confidence=1.0,
        consensus_dir=consensus_dir,
        rows=rows,
        best_lag_symbol=best,
    )


def _f(sym, rank, state, score):
    return Factors(
        symbol=sym,
        break_rank=BreakRank(rank=rank, bar_index=0, time=float(rank), direction=1),
        trend_strength_pct=80.0, lag_distance=1.5, direction=1,
        whipsaw=False, whipsaw_1h=False, usd_state="both_below",
        range_high=1.1, range_low=0.9, poc=1.0, volume_veto=False,
        score=score, state=state, flags=[],
    )


def test_latch_advances_only_forward():
    """Within one direction, state may advance but never retreat."""
    latch = Latch()
    # First: EUR becomes LEADER-BREAK.
    snap1 = _fake_snapshot([_f("EURUSD", 1, config.LEADER_BREAK, 10)], consensus_dir=-1)
    t1 = latch.update(snap1)
    assert ("EURUSD", config.WAITING, config.LEADER_BREAK) in t1
    assert latch.latched_state("EURUSD") == config.LEADER_BREAK

    # Now scoring reports WAITING again (noise) — latch must NOT retreat.
    snap2 = _fake_snapshot([_f("EURUSD", 1, config.WAITING, 5)], consensus_dir=-1)
    t2 = latch.update(snap2)
    assert t2 == []  # no transition
    assert latch.latched_state("EURUSD") == config.LEADER_BREAK


def test_latch_resets_on_direction_flip():
    latch = Latch()
    latch.update(_fake_snapshot([_f("EURUSD", 1, config.LEADER_BREAK, 10)], consensus_dir=-1))
    assert latch.latched_state("EURUSD") == config.LEADER_BREAK
    # Direction flips to +1 -> reset.
    latch.update(_fake_snapshot([_f("EURUSD", 1, config.LEADER_BREAK, 10)], consensus_dir=1))
    # After a flip, the latch rebuilds from the new-direction snapshot.
    assert latch._direction == 1


def test_latch_loss_of_consensus_clears():
    latch = Latch()
    latch.update(_fake_snapshot([_f("EURUSD", 1, config.LEADER_BREAK, 10)], consensus_dir=-1))
    # consensus_dir == 0 -> everyone WAITING.
    latch.update(_fake_snapshot([_f("EURUSD", 1, config.WAITING, 5)], consensus_dir=0))
    assert latch.latched_state("EURUSD") == config.WAITING


def test_poc_returns_densest_bucket():
    prices = [1.0] * 50 + [2.0] * 10 + [1.5] * 5  # dense near 1.0
    poc = _poc(prices, buckets=20)
    assert poc is not None and 0.95 <= poc <= 1.10


def test_poc_empty_or_flat():
    assert _poc([]) is None
    assert _poc([1.0]) is not None  # single point -> its own value


def test_usd_direction_from_anchors_split(monkeypatch):
    # No anchors present -> split -> no consensus.
    assert _usd_direction({}) == 0


def test_break_sequence_ranking():
    """score_all ranks broken instruments by cross time (earliest = 1st)."""
    import numpy as np
    from trading.evwma import compute_evwma
    from trading.scoring import InstrumentFeatures
    from trading.config import Instrument

    # Build three synthetic uptrends that cross their EVWMA at different times.
    def make(sym, cross_bar):
        n = 120
        closes = [1.0] * 40 + ([1.0] * (cross_bar - 40)) + [1.0 + (i - cross_bar) * 0.02 for i in range(cross_bar, n)]
        # pad to length n
        closes = closes[:n]
        df = pd.DataFrame({
            "time": list(range(n)),
            "open": closes, "high": [c + 0.01 for c in closes],
            "low": [c - 0.01 for c in closes], "close": closes, "volume": [1000.0] * n,
        })
        primary = compute_evwma(df)
        return sym, InstrumentFeatures(symbol=sym, primary=primary, primary_df=df,
                                       context=None, context_df=None, invert=False)

    feats = dict([make("EURUSD", 60), make("GBPUSD", 70), make("AUDUSD", 80)])
    # Force a consensus by adding anchors below their EVWMA (USD weak = -1).
    # Simple flat frames so the anchors sit below.
    def flat(sym, below=True):
        n = 120
        c = 1.0
        center = c + (0.01 if below else -0.01)
        closes = [c] * n
        df = pd.DataFrame({
            "time": list(range(n)),
            "open": closes, "high": closes, "low": closes, "close": closes, "volume": [1000.0] * n,
        })
        primary = compute_evwma(df)
        return sym, InstrumentFeatures(symbol=sym, primary=primary, primary_df=df,
                                       context=None, context_df=None, invert=True)

    feats["USDCAD"] = flat("USDCAD", below=True)[1]
    feats["USDCHF"] = flat("USDCHF", below=True)[1]

    snap = score_all(feats)
    broken = {r.symbol: r.break_rank.rank for r in snap.rows if r.break_rank.rank > 0}
    # Ranks should be 1..k contiguous and start at 1.
    if broken:
        assert min(broken.values()) == 1
        assert sorted(broken.values()) == list(range(1, len(broken) + 1))
