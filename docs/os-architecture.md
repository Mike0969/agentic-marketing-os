# Agentic OS — Architecture

**Status:** 2026-06-21 · **clean restart executed**
**Goal:** evolve this Marketing OS into a unified **Agentic OS** with three domains —
**Marketing**, **Trading**, **Founder Ops** — sharing one shell, Supabase, and Hermes.

---

## ★ CLEAN RESTART (executed 2026-06-21)

The UI/shell was rebuilt from a clean base. The old implementation is **archived,
not deleted** (`_archive/`, recoverable via git history). Build / `tsc` / lint stay
green.

### KEPT (foundation)
- Toolchain: Next 15 App Router, TS strict, Tailwind, ESLint config.
- `middleware.ts` (auth gating); auth pages (`app/login`, `forgot-password`, `reset-password`, `auth/callback`).
- Supabase layer (`lib/supabase/*`, `lib/auth.ts`, `lib/data.ts`, `lib/local-store.ts`, `lib/seed.ts`, `lib/activity.ts`, `lib/types.ts`, `lib/content-store.ts`) + tables: brands, agents, campaigns, content_items, approvals, agent_runs, admin_users (+ integration_configs, agent_settings/targets/signals, model_registry).
- **Hermes client pattern**: `lib/agents/hermes-client.ts` (+ deps it needs: `hermes-registry.ts`, `agent-config-store.ts`, `agent-runs.ts`) — reused across all domains.
- GSC connector: `lib/analytics/*`, `lib/integrations.ts`, `lib/integration-store.ts`, `app/api/analytics/search-console/pull`, env `GOOGLE_*`.
- Toolchain scripts (`scripts/check-supabase.mjs`, `clean-next.mjs`, `env-loader.mjs`, `seed-supabase.mjs`, `test-gsc.mjs`).
- `components/ui.tsx` (used by auth pages).

### ARCHIVED → `_archive/` (do not delete)
- All old pages: `app/page.tsx`, the top-level marketing pages, the duplicate `app/marketing/*`, and Codex's earlier `app/trading|founder` + `app/api/os`.
- Old UI components (app-shell, live-brain, pipeline-board, approval-queue, brand/campaign editors, integration/models settings, agent-* editors, weekly-content-plan-workflow, status, os-workflow-runner).
- Marketing/agent runners (crina-runner, dispatch, team-runner, sub-agent-runner, crina-plan-rework, learning-store, visual-asset-generator, agent-catalog, agent-signals, agent-status, model-registry), `lib/os-workflows.ts`, `lib/workflows/*`.
- `prompts/`, `agents/`, `scripts/check-workflow-schema.mjs`.
- `tsconfig.json` excludes `_archive` so it never affects builds/typecheck.

### NEW shell (built this pass)
```
app/
  layout.tsx              # root: html/body, dark theme, force-dynamic
  globals.css
  (shell)/
    layout.tsx            # OS shell: sidebar nav + top bar + Hermes status badge
    page.tsx              # OS Home: Hermes status, 3 domain cards, recent agent runs, quick actions
    marketing/page.tsx    # command center (real Supabase counts) + module cards
      brands, campaigns, pipeline, approvals, analytics, agents   # skeletons
    trading/page.tsx      # command center
      fx-scanner, quant-lab, risk-governor                        # skeletons
    founder/page.tsx      # command center
      daily-review, tasks, research, investors                    # skeletons
    settings/page.tsx     # skeleton
  login, forgot-password, reset-password, auth/callback           # kept (no shell)
  api/auth, api/analytics                                          # kept
components/os/{ui.tsx, os-shell.tsx}                               # new dark primitives + shell
lib/agents/hermes-health.ts                                        # new shell status probe
```
- **Branding:** "Agentic OS" / "Personal Command Center". Dark, minimal (Vercel/Linear feel). No "Agency Operations" language.
- **Shell:** `app/(shell)/layout.tsx` wraps all OS routes via a route group (no URL segment); auth pages stay outside it.
- All skeleton sub-pages render a clear **"No backend yet"** notice. Marketing front shows real counts to prove Supabase + the stack still work.

### Governance (unchanged, all domains)
Marketing = drafts only (no live posting). Trading = research/risk only (no broker orders). Founder = decision support only. Human approval gates + server-side secrets.

> Next: Codex rebuilds each domain screen-by-screen per `/CODEX_PLAN.md`, wiring to
> the kept Supabase tables + `hermes-client.ts`. Marketing first (S2 core), then
> Trading, then Founder.

---

> ⚠️ **Read [code-health-report.md](code-health-report.md) first.** The OS expansion
> is **gated behind stabilization S1+S2**. Do **not** add Trading/Founder features
> until S1 (clean build/run, no broken routes) and S2 (solid Marketing core) are done.

---

## Part 1 — Current OS (as built)

### Routing (`app/`)
Two overlapping trees exist right now (a half-finished refactor):

- **Canonical (in nav):** `app/marketing/*` — `page` (marketing home), `brands`, `agents`, `agent-brain`, `system-map` (Live Brain), `campaigns`, `workflows/weekly-content-plan`, `content-pipeline`, `approvals`, `analytics`, `settings`.
- **Orphaned duplicates (NOT in nav, still routable, drifting):** the same pages at top level — `app/brands`, `app/agents`, `app/campaigns`, `app/approvals`, `app/analytics`, `app/settings`, `app/content-pipeline`, `app/agent-brain`, `app/system-map`, `app/workflows/weekly-content-plan`.
- **Root:** `app/page.tsx` = "Unified Control Tower" linking to `/marketing`, `/trading`, `/founder`.
- **Missing:** `app/trading` and `app/founder` (linked but 404).
- **Auth:** `app/login`, `app/forgot-password`, `app/reset-password`, `app/auth/callback`; `middleware.ts` gates everything except public auth paths + a few API routes.

### API routes (`app/api/`)
- Agents: `agents/crina/weekly-content-plan`, `agents/crina/rework-plan`, `agents/dispatch`, `agents/{seo,content-creator,visual-video,competitor-intelligence,publishing,analytics}/run`, `agents/team/run`, `agents/team/report`, `agents/status`.
- Config/observability: `agent-settings`, `agent-targets`, `agent-signals`, `agent-memory`, `models`.
- Marketing data: `brands/[id]`, `campaigns`, `content-items`, `approvals`, `workflows/weekly-content-plan/generate`.
- Integrations/analytics: `integrations`, `integrations/[provider]/test`, `analytics/search-console/pull`.
- Auth: `auth/logout`.

### Dashboards (what each does)
| Page | Purpose | Real? |
|---|---|---|
| Home (`/`) | Cross-domain control tower | Real (links) |
| Marketing (`/marketing`) | Marketing command center | Real |
| Brands | Brand profiles (positioning, pillars, SEO, CTAs) | Real (DB) |
| Agents | Agent roster cards | Mostly display |
| Agent Brain | Observability (runs, tokens, latency, models, memory, model picker) | Real |
| Live Brain (`system-map`) | Interactive physics agent graph + signals/escalations | Real (recent) |
| Campaigns | Campaign CRUD | Real (DB) |
| Workflows | Crina weekly content plan | Real (Hermes + fallback) |
| Pipeline | Kanban; dispatch idea→draft | Real |
| Approvals | Two human gates | Real |
| Analytics | GSC panel real; rest mock | Partial |
| Settings | Integrations + model registry | Partial (Hermes/GSC real; rest scaffold) |

### Hermes integration (today)
- **Client:** `lib/agents/hermes-client.ts` calls a generic OpenAI-compatible `/v1/chat/completions`; injects agent id/role/allowed+blocked actions + shared-brain context + strict JSON; primary→backup model retry; per-agent model override; deterministic fallback.
- **Registry/brain:** `lib/agents/hermes-registry.ts` reads `team.json` + the shared brain dir (source of truth for the agent team); `agents/*-soul.md` hold agent definitions.
- **Runners:** `crina-runner`, `dispatch`, `team-runner`, `sub-agent-runner`, `crina-plan-rework`; observability in `agent-runs`/`agent-status`/`agent-signals`; `learning-store` records human feedback; `visual-asset-generator` for images.
- **Env:** `HERMES_AGENT_ENDPOINT`, `HERMES_AGENT_TOKEN`, `HERMES_AGENT_MODEL`, `HERMES_AGENT_BACKUP_MODEL`, `HERMES_AGENT_TIMEOUT_MS`, `HERMES_TEAM_PATH`, `HERMES_BRAIN_PATH`, `AGENT_TRIGGER_TOKEN`; analytics `GOOGLE_*`; Supabase `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY`.
- **Supabase:** brands, agents, campaigns, content_items, approvals, activity, admin_users, integration_configs, agent_runs (+ agent_settings/targets/signals, model_registry); RLS admin-gated; local JSON fallback (`data/local-dashboard.json`).

---

## Part 2 — Target Agentic OS structure

### Top-level navigation
```
Home
Marketing OS   → brands, agents, agent brain, live brain, campaigns,
                 workflows, pipeline, approvals, analytics, settings
Trading OS     → FX Scanner, Quant Lab, Risk Governor        (S3)
Founder Ops    → Daily Review, Tasks, Research, Investor Tools (S3)
```

### Folder layout (target)
```
app/
  (shell)/            # shared layout, nav, auth chrome (route group, no URL segment)
    layout.tsx
  page.tsx            # control tower (keep)
  marketing/          # CANONICAL marketing (consolidate here; delete top-level dupes)
    dashboard | page.tsx
    brands, agents, agent-brain, system-map, campaigns,
    workflows/weekly-content-plan, content-pipeline, approvals, analytics, settings
  trading/            # S3 — new
    page.tsx          # cards: FX Scanner, Quant Lab, Risk Governor
    fx-scanner, quant-lab, risk-governor
  founder/            # S3 — new
    page.tsx          # daily review, tasks, quick actions
    daily-review, tasks, research, investors
  api/                # group future routes: api/trading/*, api/founder/*
```

Design principles:
- **One shell** (`(shell)` group) wraps all domains; nav switches domain context.
- **Domain isolation:** `app/<domain>` + `lib/<domain>` + `api/<domain>` so domains don't entangle.
- **Shared agent core** (`lib/agents/*`, Hermes client, observability) is cross-domain — Trading/Founder agents reuse it.
- **Governance constant across domains:** Marketing = drafts only (no live posting); Trading = research/risk only (no broker orders); Founder = briefs/decision support only.

---

## Part 3 — Refactor + expansion plan (STABILIZATION-FIRST)

> Ordering is mandatory: **S1 → S2 → S3**. No Trading/Founder features before S1+S2.
> Full task list lives in [code-health-report.md §5](code-health-report.md) and `/CODEX_PLAN.md`.

### S1 — Stabilize routing & shell (no new features)
1. **Consolidate marketing**: keep `app/marketing/*`; delete the orphaned top-level marketing pages, OR replace each `app/<x>/page.tsx` with `redirect("/marketing/<x>")` to preserve old links. One source of truth.
2. **Unbreak nav**: add minimal placeholder `app/trading` + `app/founder` ("No backend yet") **or** temporarily remove their nav/home links. (Placeholders are scaffolding, not features.)
3. Introduce `app/(shell)/layout.tsx` as the shared chrome (optional in S1; can stay as `components/app-shell.tsx` until S3).
4. Verify every nav item loads, no 404s, build/tsc/lint stay green.

### S2 — Solidify Marketing core
1. E2E the real path (Crina → pipeline → approvals) with Hermes up and down.
2. Label fallback/mock output clearly (placeholder ≠ trusted); honest connector status in Settings.
3. Confirm/flag visual asset generation; keep analytics' real-vs-sample split strict.
4. Add smoke tests for agent runners (esp. fallback).

### S3 — Add Trading & Founder (only after S1+S2)
1. Build `app/trading` dashboards (FX Scanner / Quant Lab / Risk Governor) — real-looking, "No backend yet".
2. Build `app/founder` dashboards (Daily Review / Tasks / Research / Investors).
3. Add `lib/trading/*` and `lib/founder/*` agent runners reusing the Hermes core.
4. Add Supabase tables per domain (trades/ideas/risk; tasks/decisions/research) with RLS.
5. Wire to Hermes via the same observability (`agent_runs`) and human-approval gates.
6. Specs: `docs/trading_agents_spec.md`, `docs/founder_ops_spec.md`; prompts in `prompts/` + `agents/`.

---

## Part 4 — Risks & coordination
- **Parallel work:** Codex has been actively committing (Live Brain, agent expansion). Do the S1 consolidation as small, isolated commits to avoid collisions; coordinate before large moves.
- **Route moves break links/bookmarks:** prefer redirects over hard deletes for the top-level dupes if anything external points at them.
- **Don't widen surface before stabilizing:** every new domain multiplies the agent/connector surface already flagged as "watch."
