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

### T1 — Trading (only after Marketing core is solid)
8. `[UI]` Flesh out `trading/fx-scanner` (FX-majors-vs-USD signal table), `quant-lab`, `risk-governor` as real dashboards.
9. `[DATA]` Tables: `fx_signals`, `trade_ideas`, `risk_rules`, `trading_runs` (RLS admin-gated; mirror `agent_runs`).
10. `[ARCH]` `lib/trading/*` runners via `hermes-client` (agent ids `agent-fx-scanner`, `agent-quant-lab`, `agent-risk-governor`); register in `team.json` + shared brain. **Research/risk only, no orders.**
11. `[UI]` Wire screens → `app/api/trading/*` → Hermes; log to `agent_runs`.

### F1 — Founder Ops (after Trading)
12. `[UI]` Flesh out `founder/daily-review`, `tasks`, `research`, `investors`.
13. `[DATA]` Tables: `founder_tasks`, `decisions`, `research_notes`, `investor_items` (RLS).
14. `[ARCH]` `lib/founder/*` runner `agent-founder-operator` via `hermes-client`. **Decision support only.** Wire `app/api/founder/*` → Hermes → `agent_runs`.

### X1 — Specs & prompts `[SAFE]`
15. `docs/trading_agents_spec.md`, `docs/founder_ops_spec.md` (I/O schemas, allowed/blocked actions, data sources, guardrails).
16. High-level OS prompt + per-agent prompts (FX Scanner, Quant Lab, Risk Governor, Founder Operator) under `prompts/` + `agents/` (the originals are in `_archive/` for reference).

---

## Shared Hermes route
- Keep one shared workflow entry per domain: `app/api/<domain>/...`, plus an
  optional `app/api/os/hermes/route.ts` for cross-domain calls. All go through
  `lib/agents/hermes-client.ts` and log to `agent_runs`.

## Coordination
- Parallel agents may be active — rebase before large moves; commit small; keep build green.
- Do NOT import from `_archive/` in shipped code (it's excluded from tsconfig). Port the logic into the new structure instead.
