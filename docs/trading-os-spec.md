# Trading OS — Information Architecture

The Trading domain is three focused workspaces, not a generic dashboard.
**Governance (absolute): research and risk review ONLY. No broker connectivity, no
orders, no execution, no position sizing as instructions — anywhere in the code.**
Every model call goes through `callModel` (Hermes via `hermes-client.ts`, or a
provider via `lib/providers/*`), resolves provider/model from `agent_config`, logs
to `agent_runs`, and badges FALLBACK / RATE LIMITED. Writes use the service-role client.

Nav: `/trading` command center → **FX Scanner** · **Quant Lab** · **Risk Governor**.

---

## 1. FX Scanner  — BUILT
Quick directional read of FX majors vs USD.

- **Purpose:** generate bias + strength snapshots per major pair and a USD composite, for fast market orientation.
- **Primary user actions:** Run Scan; read latest signals + USD composite; (next) pick pairs/timeframes; (next) browse scan history.
- **Key inputs:** pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF, + majors), timeframes (15m, 1H), optional supplied market data; model (default `glm-5.2`, switchable via `agent_config`).
- **Key outputs:** per-pair `{ bias: bullish|bearish|neutral, strength 0–10, summary }`; USD composite banner; last-run time + model.
- **Data dependencies:** `fx_signals` table; `POST /api/trading/fx-scan` (FX Scanner agent via `callModel`) + `GET /api/trading/fx-scan/latest`; `agent_runs`.
- **Guardrails:** research only; bias/strength is analysis, not advice; no orders/sizing/SL/TP; disclaimer; no broker calls.

## 2. Quant Lab  — TO BUILD  (deep spec: `docs/quant-lab-spec.md`)
A strategy **research & system-validation** workspace — explicitly NOT a generic coding page.

- **Purpose:** track strategy ideas/hypotheses, run experiments, attach backtest artifacts produced by coding agents, capture validation notes, compare versions, and promote a strategy from **idea → reviewed signal logic**.
- **Primary user actions:** create a strategy + hypothesis; set symbols/timeframes/session filters/signal logic; run Quant Lab agent analysis; hand off to a coding agent (Codex/ZCode) for a backtest and attach the result; add validation notes; advance status (Exploratory → In Validation → Reviewed).
- **Key inputs:** hypothesis, market (fx → later stocks/options), symbols, timeframes, session filters, signal-logic description/params, attached artifacts + metrics.
- **Key outputs:** structured agent analysis (hypothesis critique, suggested signal logic, what-to-test-next, pitfalls, proposed backtest plan, readiness), experiment records with metrics + a "what changed" diff per version, validation verdicts, and a promotion status.
- **Data dependencies:** `quant_strategies`, `strategy_experiments`, `strategy_artifacts`, `strategy_notes`; `/api/trading/strategies*` + `/api/trading/quant-lab/analyze`; Quant Lab agent (`agent-quant-lab`); `agent_runs`; coding-agent artifacts (referenced, not stored).
- **Guardrails:** research/validation only; coding agents implement/run backtests **outside** the dashboard (the OS never executes code or trades); metrics are research; promotion to Reviewed is a human decision; disclaimers.

## 3. Risk Governor  — TO BUILD
Advisory review of account/portfolio risk.

- **Purpose:** compute exposure/drawdown metrics, check configured risk rules, flag violations, and give an overall risk read — advisory only.
- **Primary user actions:** Run Risk Review; manage risk rules; read violations + risk level + recommendations.
- **Key inputs:** account equity, equity curve, open positions, current/max drawdown, risk rules.
- **Key outputs:** metrics (current/max drawdown, gross exposure, open risk %, exposure by symbol), rule violations `{ rule, severity, detail, recommendation }`, overall risk level, recommendations.
- **Data dependencies:** `risk_rules` table (+ optional `risk_reviews`); `POST /api/trading/risk-review` (`agent-risk-governor` via `callModel`) + latest; `agent_runs`.
- **Guardrails:** advisory only; never opens/closes positions or places orders; recommendations are for the human; disclaimer.

---

## Cross-cutting
- Provider/model per agent from `agent_config` (switchable on `/agents`); all runs in `agent_runs`; 429 → soft `rate_limited`.
- No broker SDK/keys/endpoints exist in the repo. Trading agents only reason over supplied data.
- Build order (CODEX_PLAN.md): FX Scanner (done) → **Quant Lab (next)** → Risk Governor.
