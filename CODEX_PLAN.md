# CODEX_PLAN.md — implementation plan for the Agentic OS

For the implementing agent (Codex). Read `docs/code-health-report.md` and
`docs/os-architecture.md` first.

**Hard rule:** STABILIZATION before features. Complete **S1** and **S2** before
any **S3** (Trading / Founder) work. Build/`tsc`/lint must stay green at every step.

**Tags:** `[ARCH]` = careful architectural change (review before/after) · `[UI]` =
mostly UI wiring · `[DATA]` = Supabase/schema · `[SAFE]` = low-risk/additive.

**Governance (never violate):** Marketing = drafts only, no live posting. Trading
= research/risk only, no broker orders. Founder = briefs/decision support only.
Human approval gates stay. Secrets stay server-side (never `NEXT_PUBLIC`).

---

## PHASE S1 — Clean build & run, no broken UX

1. `[ARCH]` **Consolidate marketing routes.** Canonical = `app/marketing/*`.
   For each orphaned top-level page (`app/brands`, `app/agents`, `app/campaigns`,
   `app/approvals`, `app/analytics`, `app/settings`, `app/content-pipeline`,
   `app/agent-brain`, `app/system-map`, `app/workflows/weekly-content-plan`):
   replace with `export default function(){ redirect("/marketing/<x>") }` OR delete.
   Prefer redirects if any external link/bookmark may exist. **One source of truth.**
   - Acceptance: no duplicate page files serve the same UI; diff drift eliminated.
2. `[UI]` **Unbreak nav.** Either add minimal `app/trading/page.tsx` +
   `app/founder/page.tsx` ("No backend yet" placeholders) OR remove `/trading` and
   `/founder` from nav + home until S3. No 404 from any visible link.
3. `[SAFE]` Verify `npm run dev`: every nav item loads, **no 404, no console errors**.
4. `[SAFE]` Keep `npm run build` + `npx tsc --noEmit` + `npm run lint` green.
5. `[SAFE]` `npm audit` triage (3 moderate, transitive) — note, don't force-fix.

**Do not proceed to S2 until all S1 boxes pass.**

---

## PHASE S2 — Solidify the Marketing core

6. `[UI]`/`[ARCH]` E2E the real path with Hermes **up and down**:
   Crina plan → Create Content Items → Pipeline "Send to agent" → draft written
   back → Approvals (gate 2) → Scheduled (suggested time). Fix what breaks.
7. `[UI]` **Label fallback/mock output** unmistakably (badge "fallback" / "sample")
   so placeholder output is never mistaken for real Hermes output.
8. `[UI]` **Honest connector status** in Settings: visibly separate wired
   (Hermes, Google Search Console) from scaffolds (social/model/n8n/Telegram).
9. `[ARCH]` Confirm `visual-asset-generator.ts` runs end-to-end (with a cost/size
   guard) or mark the feature "partial" in the UI.
10. `[SAFE]` Add smoke tests for the agent runners (at least deterministic-fallback
    paths) + a basic CI check (build + tsc).

**Do not proceed to S3 until S2 is solid.**

---

## PHASE S3 — Add Trading + Founder Ops (only after S1+S2)

### S3.1 Shell `[ARCH]`
11. Introduce `app/(shell)/layout.tsx` as shared chrome; keep domain nav grouped
    (Marketing / Trading / Founder). Migrate `components/app-shell.tsx` into it.

### S3.2 Trading `[UI]` then `[DATA]`/`[ARCH]`
12. `[UI]` `app/trading/page.tsx` — cards for **FX Scanner**, **Quant Lab**,
    **Risk Governor** (real-looking dashboards, "No backend yet").
13. `[UI]` Sub-pages: `app/trading/fx-scanner` (FX-majors-vs-USD signal table),
    `quant-lab` (research/backtest cards), `risk-governor` (exposure/risk rules).
14. `[DATA]` Supabase tables: `trade_ideas`, `fx_signals`, `risk_rules`,
    `trading_runs` (RLS admin-gated; mirror `agent_runs` observability).
15. `[ARCH]` `lib/trading/*` runners reusing `lib/agents/hermes-client.ts`
    (agent ids: `agent-fx-scanner`, `agent-quant-lab`, `agent-risk-governor`);
    register them in `team.json` + shared brain; **research/risk only, no orders.**
16. `[UI]` Wire screens to `api/trading/*` → Hermes; log to `agent_runs`.

### S3.3 Founder Ops `[UI]` then `[DATA]`/`[ARCH]`
17. `[UI]` `app/founder/page.tsx` — daily review, tasks, quick actions.
18. `[UI]` Sub-pages: `daily-review`, `tasks`, `research`, `investors`.
19. `[DATA]` Supabase tables: `founder_tasks`, `decisions`, `research_notes`,
    `investor_items` (RLS admin-gated).
20. `[ARCH]` `lib/founder/*` runner `agent-founder-operator` reusing the Hermes
    core; **briefs/decision support only.** Wire to `api/founder/*` + `agent_runs`.

### S3.4 Specs & prompts `[SAFE]`
21. Write `docs/trading_agents_spec.md` and `docs/founder_ops_spec.md` (I/O schemas,
    allowed/blocked actions, data sources, guardrails).
22. Add high-level OS prompt + per-agent prompts (FX Scanner, Quant Lab, Risk
    Governor, Founder Operator) in `prompts/` and `agents/*-soul.md`.

---

## Coordination notes
- Work in **small, isolated commits**; keep build green per commit.
- Parallel agents have been committing; rebase/coordinate before large moves (esp. S1 consolidation and S3.1 shell).
- Reuse the existing observability (`agent_runs`, `agent-status`, `agent-signals`) and the human-approval pattern for every new domain — don't invent parallel mechanisms.
