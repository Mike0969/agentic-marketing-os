# CODEX_PLAN.md — Agentic OS build plan (post clean-restart)

For the implementing agent (Codex). Read `docs/os-architecture.md` (see the
"CLEAN RESTART" section) and `docs/code-health-report.md` first.

**State now:** the OS shell + home + domain skeletons exist and build green. Old
code is in `_archive/` (reference, don't import). KEPT foundation: Supabase layer,
`lib/agents/hermes-client.ts` (+ `hermes-registry`, `agent-config-store`,
`agent-runs`), GSC connector, `middleware.ts`, auth pages, `components/ui.tsx`,
new `components/os/*` + `lib/agents/hermes-health.ts`.

**Hard rules:**
- Build / `npx tsc --noEmit` / `npm run lint` stay green at every commit. Small, isolated commits.
- Every agent call goes through `lib/agents/hermes-client.ts`. Every run logs to `agent_runs`. Fallback/mock output must be badged **FALLBACK**/**DEMO** in the UI.
- Governance: Marketing = drafts only (no live posting). Trading = research/risk only (no broker orders). Founder = decision support only. Human approval gates. Secrets server-side only.
- Reuse `_archive/` as reference when rebuilding (the old logic mostly works) — port, don't blind-copy; keep the new dark OS aesthetic (`components/os/*`).

**Tags:** `[ARCH]` careful architecture · `[UI]` UI wiring · `[DATA]` Supabase/schema · `[SAFE]` low-risk.

---

## ORDER: Marketing → Trading → Founder. Screen by screen.

### M0 — `[SAFE]` Verify the restart
- `npm run dev`: every nav item (Home, Marketing+subs, Trading+subs, Founder+subs, Settings) loads, no 404, no console errors. Hermes badge reflects real status.

### M1 — Marketing: rebuild real screens (reuse kept tables, port from `_archive/`)
1. `[UI]`/`[DATA]` **Brands** → list + editor on `brands` table (port `_archive/components/brand-editor.tsx`, restyle to `components/os/*`).
2. `[UI]`/`[DATA]` **Campaigns** → on `campaigns` table.
3. `[UI]`/`[ARCH]` **Pipeline** → `content_items` board + "dispatch to agent" via `hermes-client` (port `_archive/lib/agents/dispatch.ts` + `sub-agent-runner.ts` + `agent-catalog.ts`). Drafts only.
4. `[UI]` **Approvals** → two human gates on `approvals` (port `_archive/components/approval-queue.tsx` + `_archive/app/api/approvals`).
5. `[UI]` **Analytics** → real GSC panel (kept connector) + clearly-labelled DEMO panels.
6. `[UI]` **Agents** → roster from `agents` + recent `agent_runs`.
7. `[UI]` **Workflows / Crina weekly plan** → port `_archive/lib/agents/crina-runner.ts` + the generate route; create `app/(shell)/marketing/workflows/...` + `app/api/marketing/*`.
- **Acceptance (S2):** Crina plan → content items → pipeline dispatch → draft → approvals → scheduled (suggested time), with Hermes up AND down (fallback badged).

## TRADING — T1–T6 (only after Marketing M1–M6 are solid)

Implement **exactly** from `docs/trading_agents_spec.md`. Governance is absolute:
**research/risk review only — no broker orders, no execution, no order tickets,
ever.** Same rules as Marketing: every call via `hermes-client.ts`, every run →
`agent_runs`, fallback/demo **badged**, `components/os/*` only, no `_archive/`
imports, build/tsc/lint green after each task. **Report after each task.**

### T1 — Trading foundation `[ARCH]`/`[DATA]` (prerequisite for the screens)
- `lib/trading/run-trading-agent.ts` — thin wrapper around `runHermesAgent` →
  validate JSON → `recordAgentRun` → deterministic fallback (port the archived
  `sub-agent-runner.ts` pattern; do not import it).
- Register `agent-fx-scanner`, `agent-quant-lab`, `agent-risk-governor` in
  `team.json` with `blocked_actions:["no broker orders","no live execution"]`.
- Add brain file `trading-brief.md` (instruments, conventions, risk policy) to
  `HERMES_BRAIN_PATH`; per-agent memory files `agent-<id>-memory.md`.
- `[DATA]` Tables: `fx_signals`, `trade_ideas`, `risk_rules` (RLS admin-gated,
  mirror existing patterns). Reuse `agent_runs` for observability.
- Acceptance: a trading agent can be called and logs to `agent_runs`; build green.

### T2 — FX Scanner screen `[UI]`/`[DATA]` (`app/(shell)/trading/fx-scanner`)
- Inputs: symbols `EUR/USD, GBP/USD, USD/JPY, USD/CHF`; timeframes `15m, 1H`
  (caller-provided `marketData` optional — if absent, score is null + a note).
- "Run scan" → `app/api/trading/fx-scan` → `agent-fx-scanner` → output exactly the
  FX Scanner schema (trend, momentum, S/R, setupQualityScore 0–100, bias, notes,
  usdStrengthSummary, disclaimer). Render a signal table; persist to `fx_signals`.
- Real Hermes output or **FALLBACK** badge if down. No order UI anywhere.
- Acceptance: scan returns + renders + logs; build green.

### T3 — Quant Lab screen `[UI]`/`[ARCH]` (`app/(shell)/trading/quant-lab`)
- Inputs: taskDescription, repoPath, targetFile, optional context.
- `app/api/trading/quant-proposal` → `agent-quant-lab` → output: plan,
  `proposedDiff`, filesTouched, explanation, testCommand, `testResult:null`, risks.
- UI shows the diff + **"Hand to Claude Code"** action (copies a ready prompt:
  apply diff to repoPath, run testCommand, report). Hermes never applies/runs/commits;
  human + Claude Code execute; human pastes `testResult` back to store.
- Acceptance: proposal renders with diff + handoff; `testResult` only set post-run; build green.

### T4 — Risk Governor screen `[UI]`/`[DATA]` (`app/(shell)/trading/risk-governor`)
- Inputs: accountEquity, equityCurve, openPositions, drawdown, riskRules.
- `app/api/trading/risk-review` → `agent-risk-governor` → output: metrics,
  ruleViolations (severity + advisory recommendation), overallRiskLevel,
  recommendations, disclaimer. Render report + violations; manage `risk_rules`.
- **Advisory only** — never close/open positions; recommendations are human-facing.
- Acceptance: review renders + logs; build green.

### T5 — Trading command center wiring `[UI]` (`app/(shell)/trading/page.tsx`)
- Replace skeleton metrics with real ones (latest FX signals count, open risk
  level from last risk review, recent trading runs from `agent_runs`).
- Cross-link the three modules; remove "No backend yet" once each is wired.
- Surface the governance banner: "Research/risk only — no orders."
- Acceptance: command center reflects real state; build green.

### T6 — Trading specs polish + prompts + guardrail audit `[SAFE]`
- Add per-agent prompts under `prompts/` + `agents/` (FX Scanner, Quant Lab, Risk
  Governor) consistent with `docs/trading_agents_spec.md`.
- Guardrail audit: grep the trading code for any order/execute/broker path — must
  be **none**; confirm every output carries `disclaimer`; every run logs; fallbacks badged.
- Acceptance: build/tsc/lint green; no execution path exists; report to user for review.

### F1 — Founder Ops (after Trading T1–T6)
- `[UI]` Flesh out `founder/daily-review`, `tasks`, `research`, `investors`.
- `[DATA]` Tables: `founder_tasks`, `decisions`, `research_notes`, `investor_items` (RLS).
- `[ARCH]` `lib/founder/*` runner `agent-founder-operator` via `hermes-client`. **Decision support only.** Wire `app/api/founder/*` → Hermes → `agent_runs`.
- Spec to be written in `docs/founder_ops_spec.md` before F1 starts.

### X1 — OS-wide prompts `[SAFE]`
- High-level OS prompt describing Marketing/Trading/Founder + how Hermes treats each, under `prompts/` (originals in `_archive/` for reference).
- `docs/agent-interconnections.md` (marketing chain) and `docs/trading_agents_spec.md` are written; add `docs/founder_ops_spec.md` when F1 is scheduled.

---

## Shared Hermes route
- Keep one shared workflow entry per domain: `app/api/<domain>/...`, plus an
  optional `app/api/os/hermes/route.ts` for cross-domain calls. All go through
  `lib/agents/hermes-client.ts` and log to `agent_runs`.

## Coordination
- Parallel agents may be active — rebase before large moves; commit small; keep build green.
- Do NOT import from `_archive/` in shipped code (it's excluded from tsconfig). Port the logic into the new structure instead.
