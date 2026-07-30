"""Backtest: does the LAGGER actually catch up after the leader breaks?

This is the edge validator. We walk the cached 15m history bar-by-bar; at each
step we reconstruct EVWMA + the scoring engine as it would have seen data up to
that bar (no look-ahead). When a fresh LEADER-BREAK transition fires (1st pair
to break in the consensus direction), we record the LAGGER identified at that
moment and measure its return over the next N bars in the break direction vs a
neutral baseline.

This runs on REAL data once the SQLite cache has filled (after the live scanner
has run for a while, or after CSV import). It is the proof that the edge exists
before trusting it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config
from .evwma import compute_evwma
from .scoring import InstrumentFeatures, score_all

log = logging.getLogger("trading.backtest")


@dataclass
class Trade:
    entry_bar: int
    leader: str
    lagger: str
    direction: int
    entry_price: float
    exit_price: float
    bars_held: int
    lagger_ret: float
    baseline_ret: float


def _window_features(frames: dict[str, pd.DataFrame], end: int, instruments) -> dict[str, InstrumentFeatures]:
    """Build features as they appeared up to bar index `end` (no look-ahead)."""
    out: dict[str, InstrumentFeatures] = {}
    for inst in instruments:
        df = frames.get(inst.symbol)
        if df is None or end >= len(df):
            continue
        sub = df.iloc[: end + 1].reset_index(drop=True)
        if len(sub) < 60:
            continue
        primary = compute_evwma(sub)
        out[inst.symbol] = InstrumentFeatures(
            symbol=inst.symbol, primary=primary, primary_df=sub,
            context=None, context_df=None, invert=inst.invert,
            group=inst.group)
    return out


def run_backtest(frames: dict[str, pd.DataFrame], instruments=None,
                 lookforward: int = 16, warmup: int = 120) -> list[Trade]:
    """Walk forward. On each fresh leader-break, open a LAGGER trade for
    `lookforward` bars in the break direction. Compare to baseline (the leader's
    own forward return).

    `frames`: symbol -> 15m OHLCV DataFrame (oldest->newest), aligned by time.
    Returns a list of Trade outcomes.
    """
    instruments = instruments or config.instruments()
    instruments = [i for i in instruments if i.symbol in frames]
    if not instruments:
        log.warning("backtest: no matching instruments in frames")
        return []

    # Align all frames to a common time index (inner join).
    base = None
    for sym, df in frames.items():
        s = df[["time", "close", "high", "low", "open", "volume"]].rename(
            columns={"close": f"close_{sym}", "high": f"high_{sym}",
                     "low": f"low_{sym}", "open": f"open_{sym}", "volume": f"vol_{sym}"})
        base = s if base is None else base.merge(s, on="time", how="inner")
    if base is None or len(base) < warmup + lookforward:
        log.warning("backtest: insufficient aligned history (%d bars)", 0 if base is None else len(base))
        return []

    # Rebuild per-symbol aligned frames.
    aligned: dict[str, pd.DataFrame] = {}
    for inst in instruments:
        sym = inst.symbol
        aligned[sym] = pd.DataFrame({
            "time": base["time"],
            "open": base[f"open_{sym}"], "high": base[f"high_{sym}"],
            "low": base[f"low_{sym}"], "close": base[f"close_{sym}"],
            "volume": base[f"vol_{sym}"],
        }).reset_index(drop=True)

    n = len(base)
    trades: list[Trade] = []
    last_dir = 0
    i = warmup
    while i < n - lookforward:
        feats = _window_features(aligned, i, instruments)
        if len(feats) < 3:
            i += 1
            continue
        snap = score_all(feats)
        # Detect a FRESH leader-break: consensus direction just established and
        # exactly one instrument broke (rank 1).
        broken = [r for r in snap.rows if r.break_rank.rank > 0]
        is_fresh = (snap.consensus_dir != 0 and snap.consensus_dir != last_dir and len(broken) >= 1)
        if is_fresh and snap.best_lag_symbol and snap.best_lag_symbol != _leader(snap):
            last_dir = snap.consensus_dir
            leader = _leader(snap)
            lagger = snap.best_lag_symbol
            entry_bar = i
            exit_bar = min(i + lookforward, n - 1)
            # Lagger return in the break direction (USD-aligned via invert).
            inst_map = {x.symbol: x for x in instruments}
            lag_inst = inst_map[lagger]
            p0 = float(aligned[lagger]["close"].iloc[entry_bar])
            p1 = float(aligned[lagger]["close"].iloc[exit_bar])
            raw_ret = (p1 - p0) / p0
            lagger_ret = -raw_ret if lag_inst.invert else raw_ret
            lagger_ret = lagger_ret if snap.consensus_dir > 0 else -lagger_ret
            # Baseline: leader's own forward return in the same direction.
            if leader in aligned:
                lp0 = float(aligned[leader]["close"].iloc[entry_bar])
                lp1 = float(aligned[leader]["close"].iloc[exit_bar])
                lraw = (lp1 - lp0) / lp0
                lead_inst = inst_map[leader]
                baseline_ret = -lraw if lead_inst.invert else lraw
                baseline_ret = baseline_ret if snap.consensus_dir > 0 else -baseline_ret
            else:
                baseline_ret = 0.0
            trades.append(Trade(entry_bar, leader, lagger, snap.consensus_dir,
                                p0, p1, exit_bar - entry_bar, lagger_ret, baseline_ret))
            i = exit_bar  # jump ahead (no overlapping trades)
            continue
        if snap.consensus_dir != 0:
            last_dir = snap.consensus_dir
        i += 1

    return trades


def _leader(snap) -> str | None:
    leaders = [r for r in snap.rows if r.break_rank.rank == 1]
    return leaders[0].symbol if leaders else None


def summarize(trades: list[Trade]) -> dict:
    if not trades:
        return {"trades": 0, "win_rate": 0.0, "avg_lagger_ret": 0.0,
                "avg_baseline_ret": 0.0, "edge": 0.0}
    wins = sum(1 for t in trades if t.lagger_ret > 0)
    avg_lag = float(np.mean([t.lagger_ret for t in trades]))
    avg_base = float(np.mean([t.baseline_ret for t in trades]))
    return {
        "trades": len(trades),
        "win_rate": round(wins / len(trades), 3),
        "avg_lagger_ret": round(avg_lag, 5),
        "avg_baseline_ret": round(avg_base, 5),
        "edge": round(avg_lag - avg_base, 5),
    }


def main() -> None:
    """Run against the SQLite cache. Print a summary.

    Requires cached OHLCV (from the live scanner) or imported CSVs. This is the
    proof of the edge; run it once real history has accumulated.
    """
    import argparse
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description="Lead/lag backtest")
    p.add_argument("--bars", type=int, default=16, help="bars to hold each trade")
    p.add_argument("--source", choices=["db", "csv"], default="db")
    args = p.parse_args()

    frames: dict[str, pd.DataFrame] = {}
    if args.source == "db":
        from .store import Store
        st = Store()
        for inst in config.instruments():
            df = st.load_ohlcv(inst.symbol, config.PRIMARY_TF)
            if not df.empty:
                frames[inst.symbol] = df
    else:
        from .data_source import CsvSource
        src = CsvSource()
        for inst in config.instruments():
            import asyncio
            oh = asyncio.run(src.get_ohlcv(inst.symbol, config.PRIMARY_TF, 100000))
            if oh is not None:
                frames[inst.symbol] = oh.df

    log.info("loaded %d instruments", len(frames))
    trades = run_backtest(frames, lookforward=args.bars)
    summary = summarize(trades)
    print("\n=== Lead/Lag Backtest ===")
    print(f"instruments:     {len(frames)}")
    print(f"trades:          {summary['trades']}")
    print(f"win rate:        {summary['win_rate']*100:.1f}%")
    print(f"avg lagger ret:  {summary['avg_lagger_ret']*100:.3f}%")
    print(f"avg baseline:    {summary['avg_baseline_ret']*100:.3f}%")
    print(f"edge (lag-base): {summary['edge']*100:+.3f}%")
    if summary["trades"] > 0:
        print("\nlast 5 trades:")
        for t in trades[-5:]:
            print(f"  bar {t.entry_bar}: leader={t.leader} lagger={t.lagger} "
                  f"dir={'UP' if t.direction>0 else 'DOWN'} "
                  f"lag={t.lagger_ret*100:+.3f}% base={t.baseline_ret*100:+.3f}%")


if __name__ == "__main__":
    main()
