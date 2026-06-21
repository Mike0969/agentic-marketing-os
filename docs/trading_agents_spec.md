# Trading Agents — Spec

Precise contracts for the three Trading OS agents. Codex implements directly from
this. **Governance (absolute): research and risk review ONLY. No broker orders, no
execution, no order tickets, no live trading. Every output is analysis/advice for a
human.** Build only after Marketing M1–M6 are solid (see `CODEX_PLAN.md`).

## Shared conventions (all trading agents)
- **Call path:** `runHermesAgent(options)` from `lib/agents/hermes-client.ts`. Never call OpenAI/Anthropic directly.
- **Logging:** every run → `recordAgentRun(...)` (`lib/agents/agent-runs.ts`) → `agent_runs` (set `agent_id`, `agent_name`, `workflow_name`, `model`, tokens, `duration_ms`, `provider_response_status`, `status`).
- **Fallback:** on `result.ok === false`, return a deterministic stub and badge it **FALLBACK** in the UI; still log `status:"fallback"`. Never fabricate precise numbers in fallback — use `null`/empty + a clear note.
- **Registry:** add each agent to `team.json` with `blocked_actions` including `"no broker orders"`, `"no live execution"`. Brain file `trading-brief.md` (instruments, conventions, risk policy) + per-agent memory `agent-<id>-memory.md`.
- **Data source:** price/account data is **caller-provided** in `input` (from a data provider, TradingView export, or manual paste). These agents reason over provided context; they do **not** connect to a broker.
- **Recommended wrapper:** `lib/trading/run-trading-agent.ts` mirroring archived `sub-agent-runner.ts` (runHermesAgent → validate JSON → recordAgentRun → fallback).
- **Output envelope:** every output JSON includes `"agent"`, `"generatedAt"` (ISO), and `"disclaimer":"Research/analysis only. Not financial advice. No orders placed."`

---

## 1. FX Scanner — `agent-fx-scanner`

**Role:** scan FX majors vs USD and report bias/quality. Research only.

**Input:**
```json
{
  "symbols": ["EUR/USD","GBP/USD","USD/JPY","USD/CHF"],
  "timeframes": ["15m","1H"],
  "marketData": [
    { "symbol":"EUR/USD","timeframe":"1H","asOf":"ISO",
      "ohlc":[{ "t":"ISO","o":0,"h":0,"l":0,"c":0 }],
      "indicators":{ "ema20":0,"ema50":0,"rsi14":0,"atr14":0 } }
  ],
  "notes": "optional human context"
}
```
- `symbols`/`timeframes` default to the four majors + `15m,1H`. `marketData` is optional; if absent the agent returns `setupQualityScore: null` and a note that live data was not supplied (no guessing).

**Output schema (strict):**
```json
{
  "agent":"FX Scanner","generatedAt":"ISO",
  "signals":[
    { "symbol":"EUR/USD","timeframe":"1H",
      "trend":"bullish|bearish|neutral",
      "momentum":"strong|moderate|weak",
      "supportLevels":[1.0820,1.0790],
      "resistanceLevels":[1.0910,1.0950],
      "setupQualityScore": 0,            // integer 0-100, or null if no data
      "bias":"long|short|none",
      "notes":"≤240 chars rationale" }
  ],
  "usdStrengthSummary":"≤200 chars cross-pair read of USD",
  "disclaimer":"Research/analysis only. Not financial advice. No orders placed."
}
```
- One `signals[]` entry per (symbol × timeframe). `bias` is directional opinion, **not** an order.

**Hermes call pattern:**
```
runHermesAgent({
  agentId: "agent-fx-scanner",
  fallbackAgentName: "FX Scanner",
  fallbackRole: "FX research analyst (read-only)",
  task: "FX majors vs USD scan",
  instructions: "Analyze each symbol/timeframe from marketData. Return trend, momentum, S/R, a 0-100 setup quality score, and a directional bias. RESEARCH ONLY — never suggest an order size, entry ticket, or execution. If marketData is missing for a pair, set setupQualityScore null and say so.",
  outputSchema: <the schema above>,
  input: <FX Scanner input>,
  brainFiles: ["trading-brief.md","agent-fx-scanner-memory.md"],
  temperature: 0.2
})
```
**Guardrails:** no order/lot/SL/TP execution instructions; levels are analysis; require `disclaimer`; never claim a trade was placed. Persist signals to `fx_signals` (T-tasks). `workflow_name:"FX Scan"`.

---

## 2. Quant Lab — `agent-quant-lab`

**Role:** turn a research/strategy task into a **proposed** code change + test plan, to be applied by **Claude Code** (human-in-the-loop). The agent **proposes**; it does not write files, run code, or commit.

**Input:**
```json
{
  "taskDescription":"e.g. add an ATR-based position-sizing helper",
  "repoPath":"/abs/path/to/strategy/repo",
  "targetFile":"src/sizing.py",
  "context":"optional: relevant code excerpts, constraints, libs"
}
```

**Output schema (strict):**
```json
{
  "agent":"Quant Lab","generatedAt":"ISO",
  "taskSummary":"string",
  "plan":["step 1","step 2"],
  "proposedDiff":"unified diff text (--- / +++ / @@), or empty if more info needed",
  "filesTouched":["src/sizing.py"],
  "explanation":"why this change, assumptions, edge cases",
  "testCommand":"e.g. pytest tests/test_sizing.py -q",
  "testResult": null,                 // ALWAYS null here — filled only after Claude Code runs it
  "risks":["string"],
  "disclaimer":"Research/analysis only. Not financial advice. No orders placed."
}
```

**Coordination with Claude Code:**
1. Quant Lab (Hermes) returns the `proposedDiff` + `testCommand` (`testResult` stays `null`).
2. The UI shows the diff and a **"Hand to Claude Code"** action that copies a ready prompt: *apply `proposedDiff` to `repoPath`, run `testCommand`, report results.*
3. **Claude Code** (separate CLI, with the human) applies the diff, runs tests, and the human pastes the outcome back; the UI stores it as `testResult`.
4. Hermes never executes, applies, or commits. No autonomous file writes from the dashboard.

**Hermes call pattern:** `runHermesAgent({ agentId:"agent-quant-lab", task:"Quant strategy change proposal", instructions:"Produce a unified-diff proposal + test command for the task. Do NOT claim you ran anything; testResult must be null. Flag risks. No live trading.", outputSchema:<above>, input:<above>, brainFiles:["trading-brief.md","agent-quant-lab-memory.md"], temperature:0.1 })`.

**Guardrails:** proposes diffs only; `testResult` always `null` from Hermes; no execution/commit; no order logic that places trades. `workflow_name:"Quant Proposal"`.

---

## 3. Risk Governor — `agent-risk-governor`

**Role:** review account risk and flag rule violations. Advisory only — never closes positions or places orders.

**Input:**
```json
{
  "accountEquity": 100000,
  "equityCurve":[{ "date":"YYYY-MM-DD","equity":0 }],
  "openPositions":[{ "symbol":"EUR/USD","side":"long|short","size":0,"entry":0,"currentPrice":0,"unrealizedPnl":0 }],
  "drawdown":{ "currentPct":0,"maxPct":0 },
  "riskRules":[{ "id":"max_open_risk","description":"≤2% equity at risk per position","threshold":2,"unit":"percent" }]
}
```

**Output schema (strict):**
```json
{
  "agent":"Risk Governor","generatedAt":"ISO",
  "summary":"≤200 chars",
  "metrics":{
    "currentDrawdownPct":0,"maxDrawdownPct":0,"grossExposurePct":0,"openRiskPct":0,
    "exposureBySymbol":[{ "symbol":"EUR/USD","exposurePct":0 }]
  },
  "ruleViolations":[
    { "rule":"max_open_risk","severity":"info|warn|critical","detail":"string","recommendation":"string (advice, not an order)" }
  ],
  "overallRiskLevel":"low|elevated|high|critical",
  "recommendations":["string"],
  "disclaimer":"Research/analysis only. Not financial advice. No orders placed."
}
```

**Hermes call pattern:** `runHermesAgent({ agentId:"agent-risk-governor", task:"Account risk review", instructions:"Compute exposure/drawdown metrics from input, check each riskRule, list violations with severity + advisory recommendation. NEVER instruct to close/open positions or place orders — recommendations are advice for the human only.", outputSchema:<above>, input:<above>, brainFiles:["trading-brief.md","agent-risk-governor-memory.md"], temperature:0.1 })`.

**Guardrails:** advisory only; never auto-acts; recommendations are human-facing; require `disclaimer`. `workflow_name:"Risk Review"`. Persist `riskRules` to `risk_rules` table.

---

## Supabase tables (created in T-tasks)
- `fx_signals(id, symbol, timeframe, trend, momentum, support_levels jsonb, resistance_levels jsonb, setup_quality_score int, bias, notes, run_id, created_at)`
- `trade_ideas(id, symbol, thesis, source_agent, status, created_at)`  *(Quant Lab / FX research backlog)*
- `risk_rules(id, rule_id, description, threshold numeric, unit, active bool, created_at)`
- `trading_runs` — **prefer reusing `agent_runs`** for observability; add `trading_runs` only if a trading-specific view is needed. RLS admin-gated, same pattern as `agent_runs`.

All three agents: drafts/analysis only, logged to `agent_runs`, fallback badged, no broker connectivity anywhere in the codebase.
