# Quant Lab — Spec (strategy research & validation workspace)

Quant Lab is a **strategy research and system-validation workspace**, not a generic
coding page. It answers, for every strategy idea:

1. What am I testing? (hypothesis)
2. What's involved? (market, symbols, timeframes, session filters, signal logic)
3. What did the last run/experiment show? (metrics + agent analysis)
4. What changed between versions? (per-experiment `change_summary` + config snapshot)
5. Is it ready for review or still exploratory? (lifecycle status)

Use case: practical FX-majors-vs-USD research first, then stocks/options. Supports
setup hypotheses, signal-logic experiments, session/timeframe filters, validation
notes, backtest/simulation artifacts, and promotion from **idea → reviewed signal logic**.

**Governance:** research/validation only. The dashboard never runs code or places
trades. Coding agents (Codex/Claude/ZCode) implement & run backtests **outside** the
app; their outputs are *referenced* here as artifacts. No broker connectivity.

---

## 1. Entities / data model

**Strategy** (`quant_strategies`) — the idea.
`id, name, market('fx'|'stocks'|'options'), thesis, symbols text[], timeframes text[], session_filters text[], signal_logic text, status('exploratory'|'in_validation'|'reviewed'|'archived'), version int, created_at, updated_at`

**Experiment** (`strategy_experiments`) — one test of a strategy version.
`id, strategy_id→strategy, version int, title, config jsonb (snapshot of symbols/timeframes/session_filters/signal_logic/params), change_summary text ("what changed vs previous"), run_type('agent_analysis'|'backtest'|'simulation'|'manual'), status('queued'|'running'|'done'|'error'|'rate_limited'), metrics jsonb (win_rate, profit_factor, max_drawdown, sharpe, trades, period…), result_summary text, agent_run_id uuid (→agent_runs), created_at`

**Artifact** (`strategy_artifacts`) — a *reference* to coding-agent / human output.
`id, strategy_id, experiment_id (nullable), kind('code'|'diff'|'notebook'|'chart'|'dataset'|'report'|'link'), source('codex'|'claude'|'zcode'|'hermes'|'human'|'upload'), ref text (git SHA / repo path / URL / Supabase Storage path), summary text, created_at`
→ Store **references, not raw files** (light + safe). Charts/CSVs may live in Supabase Storage with the path in `ref`.

**Note** (`strategy_notes`) — validation thread.
`id, strategy_id, experiment_id (nullable), author ('human' | agent name), verdict('promising'|'inconclusive'|'rejected'|'note'), note text, created_at`

> Versioning: each config change or experiment captures `version` + `config` snapshot +
> `change_summary`, which together answer "what changed between versions" — no separate
> versions table needed for v1.

## 2. Workflow states

**Strategy lifecycle:** `exploratory → in_validation → reviewed → archived`
- **exploratory:** hypothesis captured; maybe an initial agent analysis. Default on create.
- **in_validation:** experiments running; backtest artifacts + metrics + validation notes accumulating. (Auto-suggest moving here after the first experiment.)
- **reviewed:** human-promoted "reviewed signal logic." **Promotion gate** requires: ≥1 `backtest` experiment with metrics, ≥1 note with verdict `promising`, and explicit human confirm. Still NO live trading.
- **archived:** parked or rejected.

**Experiment states:** `queued → running → done | error | rate_limited` (mirror `agent_runs`; reuse the FALLBACK/RATE LIMITED badge treatment).

## 3. Page sections / widgets

**A. Quant Lab board** (`/trading/quant-lab`)
- Columns by status: **Exploratory | In Validation | Reviewed | Archived**.
- Strategy card: name, market badge, symbols·timeframes chips, latest experiment status + key metric, version. Click → detail.
- "New strategy" button.

**B. New Strategy form** (modal or section): name, market, symbols (multi), timeframes (multi), session filters (multi, e.g. London / NY / London-NY overlap), thesis/hypothesis, initial signal logic.

**C. Strategy detail** (`/trading/quant-lab/[id]`) — the workspace:
1. **Hypothesis panel** — thesis (editable).
2. **Config panel** — symbols, timeframes, session filters, signal logic. Editing bumps `version` and prompts for a `change_summary`.
3. **Experiments timeline** — newest first: version, run_type, status badge, key metrics, `change_summary`, link to agent analysis, timestamp. Actions: **Run analysis**, **New experiment**.
4. **Validation notes** — thread with verdict chips; add note.
5. **Artifacts** — list with source badge + open link; **Attach artifact** (kind/source/ref/summary); **Generate coding-agent prompt** (copies a ready handoff for Codex/ZCode).
6. **Promotion control** — status stepper + the promotion checklist; **Promote to Reviewed** (human-only).
7. **Agent runs** — recent `agent_runs` for this strategy.

## 4. How Hermes + coding agents interact

**Quant Lab agent** (`agent-quant-lab`, via `callModel`; provider/model from `agent_config`):
- Input: `{ strategy: {name, market, thesis, symbols, timeframes, session_filters, signal_logic}, experimentConfig, priorExperimentsSummary }`.
- Output (strict JSON): 
```json
{ "agent":"Quant Lab","generatedAt":"ISO",
  "hypothesisCritique":"string",
  "suggestedSignalLogic":"string",
  "sessionTimeframeNotes":"string",
  "whatToTestNext":["string"],
  "pitfalls":["string"],
  "proposedBacktestPlan":{ "dataNeeded":["string"],"entryRules":["string"],"exitRules":["string"],"metricsToReport":["string"] },
  "readinessAssessment":"exploratory|needs-more-data|ready-for-backtest|ready-for-review",
  "disclaimer":"Research/analysis only. Not financial advice. No orders." }
```
- Persisted as an experiment (`run_type:'agent_analysis'`, `result_summary`, `agent_run_id`); logged to `agent_runs`. **Proposes only** — never runs code or trades. (This supersedes the minimal Quant Lab agent contract in `trading_agents_spec.md`.)

**Coding agents** (Codex / Claude / ZCode) — do the actual backtest **outside** the dashboard:
- **Generate coding-agent prompt** builds a ready prompt embedding the strategy + `proposedBacktestPlan` (symbols, timeframes, session filters, entry/exit rules, metrics to report) and asks the coding agent to implement/run the backtest in the strategy repo and report metrics + a chart.
- The human runs it; then **Attach artifact** records the result by reference: `source:'codex'|'claude'|'zcode'`, `kind:'code'|'diff'|'chart'|'report'`, `ref:` git commit SHA / repo path / URL / Storage path, plus an experiment (`run_type:'backtest'`, `metrics` jsonb).
- The dashboard stores references and metrics only — it does not execute code or fetch broker data.

**Loop:** hypothesis → Quant Lab agent critique + backtest plan → coding agent implements/runs (outside) → artifact + metrics attached → validation note → promote to Reviewed.

## 5. Supabase tables
Migration `0014_quant_lab.sql` — `quant_strategies`, `strategy_experiments`,
`strategy_artifacts`, `strategy_notes`. RLS admin-gated + grants, copying the
`0013_trading_founder_os.sql` pattern (`is_admin()` policies). Agent/route writes use
the service-role client.

---

## 6. Codex implementation tasks (Quant Lab = Trading T3)

Operational, in order. Build/`tsc`/lint green after each; report after each.
Prereq: register `agent-quant-lab` in `team.json` + add `trading-brief.md` to the brain.

- **Q1 `[DATA]`** Create `supabase/migrations/0014_quant_lab.sql` with the four tables (§1) + RLS/grants (copy `0013` pattern). Add a `runMigration`-compatible entry if the repo's migration runner expects it.
- **Q2 `[DATA]`** `lib/trading/quant-lab-store.ts` + types in `lib/types.ts`: CRUD via service-role client (mirror existing stores) — strategies (list/get/create/update/promote), experiments (list/create/update-status+metrics), artifacts (list/create), notes (list/create).
- **Q3 `[API]`** Routes (all `requireAdmin`, `runtime="nodejs"`, fx-scan style):
  - `GET|POST /api/trading/strategies`
  - `GET|PATCH /api/trading/strategies/[id]`
  - `POST /api/trading/strategies/[id]/promote` (enforce the promotion checklist server-side)
  - `GET|POST /api/trading/strategies/[id]/experiments`
  - `POST /api/trading/strategies/[id]/notes`
  - `POST /api/trading/strategies/[id]/artifacts`
  - `POST /api/trading/quant-lab/analyze` — body `{ strategyId, experimentConfig }` → `callModel('agent-quant-lab', …, jsonSchema=§4)` → create `strategy_experiments(run_type:'agent_analysis')` + `recordAgentRun` (map `rateLimited→rate_limited`) + set `agent_run_id`.
- **Q4 `[UI]`** `app/(shell)/trading/quant-lab/page.tsx`: status-column board + New Strategy form. `components/os/*` only; replace the current skeleton.
- **Q5 `[UI]`** `app/(shell)/trading/quant-lab/[id]/page.tsx`: hypothesis, config (edit→version+change_summary), experiments timeline, notes thread, artifacts (+Attach), promotion stepper, agent-runs panel. Actions: Run analysis (→ analyze route), Generate coding-agent prompt (client clipboard), Attach artifact, Promote.
- **Q6 `[UI]`** Status/badges: experiment + agent-run badges incl. **FALLBACK** and **RATE LIMITED**; disclaimer banner. **Acceptance:** create a strategy → Run analysis (real `agent-quant-lab`, logged in `agent_runs`) → attach a backtest artifact + metrics → add a `promising` validation note → Promote to Reviewed; all persists; no code execution, no orders anywhere.

After Quant Lab: Trading T4 = Risk Governor (`risk_rules` + `agent-risk-governor` + review screen), per `docs/trading-os-spec.md`.
