# Agent Kanban — Spec (Phase 1.5)

A cross-domain **/agents** Kanban showing every agent (Marketing + Trading +
Founder) with real status from `agent_runs`, a real model switcher writing to
`agent_config`, and a smoke-run button. Docs/schema only; Codex implements from
this (`CODEX_PLAN.md` P5–P6).

## Location & nav
- Page: `app/(shell)/agents/page.tsx` (top-level `/agents`, cross-domain).
- Add **"Agents"** to the shell nav (`components/os/os-shell.tsx`) between Founder and Settings.
- (The existing `app/(shell)/marketing/agents` is the marketing-only roster; this `/agents` is the OS-wide control board. Reuse `components/os/*` primitives.)

## Hard rules
- Every run goes through the provider layer (`callModel` → Hermes via `hermes-client.ts`, or `lib/providers/<provider>.chat()` for non-Hermes). Every run logs to `agent_runs`. Fallback/demo output badged **FALLBACK**/**DEMO**.
- Model switch is **real**: writes `agent_config`; the next run reads it. Secrets server-side only. `requireAdmin` on all routes. Build/tsc/lint green.

---

## 1. Columns
`Idle → Queued → Running → Done → Error`

**Derivation:**
- **Persistent** (from latest `agent_runs` row for the agent):
  - no runs → **Idle**
  - last `status="success"` → **Done**
  - last `status="fallback"` → **Done** + amber **FALLBACK** badge (completed, degraded)
  - last `status="error"` → **Error**
- **Transient** (client, during a triggered run): on **Run**, the card optimistically moves Idle→**Queued**→**Running**; on the run response it settles to **Done**/**Error**. Batch "Run all" leaves not-yet-started cards in **Queued**.
- (Optional, later) persist in-flight state via a small `agent_run_state` row or an `agent_runs.status` extension; not required for v1 — optimistic Running is accurate because the run is genuinely in flight, and the board refreshes from `agent_runs` after.

---

## 2. Agent → domain mapping
Static map by `agent_id` (or add a `domain` field to `team.json`):
```
Marketing: agent-crina, agent-seo, agent-content-creator, agent-visual-video,
           agent-competitor-intelligence, agent-publishing, agent-analytics
Trading:   agent-fx-scanner, agent-quant-lab, agent-risk-governor
Founder:   agent-founder-operator
```
Agents come from `team.json` (registry) merged with the Supabase `agents` roster.

---

## 3. Card data shape
Computed server-side in the page (merge `team.json` + `agents` + `agent_config` + latest `agent_runs`):
```ts
type AgentKanbanCard = {
  agentId: string;            // agent-crina
  name: string;               // Crina
  domain: "Marketing" | "Trading" | "Founder";
  provider: string;           // from agent_config, else "hermes"
  model: string;              // from agent_config, else default
  column: "idle" | "queued" | "running" | "done" | "error";
  lastRunAt: string | null;
  lastRunStatus: "success" | "fallback" | "error" | null;
  lastRunSummary: string | null;   // short text from agent_runs.output/error
};
```

**Card UI (`components/os/*`):** name + domain badge + provider/model line · last run
time + status badge (FALLBACK amber where applicable) · last output summary (1–2 lines) ·
buttons: **Run** · **Switch model** (dropdown) · **View logs**.

---

## 4. Endpoints (`app/api/os/agents/...`, all `requireAdmin`, `runtime="nodejs"`)

**`POST /api/os/agents/[agentId]/run`** — smoke run on the assigned provider/model.
- Resolves `{provider, model}` (agent_config → agent_settings → env), builds a minimal
  valid input for that agent (a tiny task/prompt), calls `callModel(...)`, then
  `recordAgentRun({ agent_id, provider, model, status, ... })`.
- Response: `{ ok, status:"success|fallback|error", provider, model, outputSummary, durationMs }`.
- This proves the agent runs on its assigned model end-to-end. **Full domain runs**
  (with real briefs/market data) still happen on the domain screens.

**`POST /api/os/agents/[agentId]/config`** — the model switcher.
- Body `{ provider, model }`. Validates `provider` against the registry and `model`
  against that provider's `/models` (reject unknown). Upserts `agent_config` by
  `agent_id` (set `updated_by` = admin email, `updated_at` = now).
- Response: `{ agentId, provider, model }`. Next run reads this.

**`GET /api/os/agents`** (optional) — returns the `AgentKanbanCard[]` for client refresh/polling (or compute in the server page and refresh via `router.refresh()`).

---

## 5. Model switcher (real)
- Dropdown groups by provider; options are the **live** models from
  `GET /api/os/providers/[provider]/models` (cached per provider for the session).
- Selecting `provider+model` → `POST /api/os/agents/[agentId]/config` → updates the card.
- Hermes remains the default provider when no `agent_config` exists.
- Runners (marketing dispatch, trading, founder) MUST read `agent_config` at call time
  (resolution order in `model-control-spec.md` §4) so the switch actually takes effect.

## 6. View logs
- Link/drawer showing the last N `agent_runs` for `agent_id` (workflow, provider,
  model, status, tokens, duration, created_at, error/summary). Reuse `getAgentRuns(agentId)`.

## 7. Acceptance
- `/agents` lists all agents across domains in the correct column from real `agent_runs`.
- **Run** triggers a real call on the assigned model, logs to `agent_runs`, card updates; FALLBACK badged when Hermes/provider degrades.
- **Switch model** persists to `agent_config`; the next Run uses the new provider/model (verify in the `agent_runs` row).
- Build / tsc / lint green.
