# Code Health Report — Agentic OS (hard audit)

**Audited:** 2026-06-21 · **HEAD:** `98e8cca` · working tree clean
**Stack:** Next.js 15 (App Router), TypeScript (strict), Tailwind, Supabase, Hermes (OpenAI-compatible)
**Node:** v22 · **npm:** 10

This is a no-assumptions audit. Treat the repo as a prototype: the toolchain is
healthy, but several features are partial/mock and the OS refactor is half-done.

---

## 1. Toolchain results (what the commands actually say)

| Check | Command | Result |
|---|---|---|
| Install | `npm install` | ✅ clean — "up to date", **3 moderate** npm-audit vulns (transitive; low priority) |
| Production build | `npm run build` | ✅ **passes** — all routes compile |
| Type check (strict) | `npx tsc --noEmit` | ✅ **0 errors** |
| Lint | `npm run lint` | ✅ no warnings/errors (note: `next lint` is **deprecated**, removed in Next 16 — migrate to ESLint CLI eventually) |
| Supabase | `npm run check:supabase` | ✅ connection OK; tables populated (brands 2, agents 7, content_items 54, agent_runs 24, integration_configs 0) |

**Bottom line:** there are **no compile/type/lint errors.** The problems below are
**runtime/architecture/feature-completeness**, which a green build does not catch.

---

## 2. Architecture/runtime issues (the real problems)

### 🔴 A. OS refactor is half-done — duplicate + broken routes
- Marketing pages exist **twice**: original top-level (`app/brands`, `app/agents`, `app/campaigns`, `app/approvals`, `app/analytics`, `app/settings`, `app/content-pipeline`, `app/agent-brain`, `app/system-map`, `app/workflows/...`) **and** a newer `app/marketing/*` tree.
- The duplicates **already differ** (`app/brands/page.tsx` ≠ `app/marketing/brands/page.tsx`) → **drift**: a fix in one won't reflect in the other.
- The **nav** (`components/app-shell.tsx`) points only at `app/marketing/*`, so the old top-level pages are **orphaned but still routable** (dead, confusing, indexable).
- The home page (`app/page.tsx`) and nav link to **`/trading`** and **`/founder`**, but **no `app/trading` or `app/founder` exists** → **runtime 404** for users who click those. Build doesn't fail because Next 404s missing routes at request time.

> This is the #1 stabilization target. Pick one marketing location, delete/redirect the other, and either build trading/founder or stop linking to them.

### 🟠 B. Secrets / connectors model is inconsistent
- Real, working (server-side env): **Hermes** (`HERMES_AGENT_ENDPOINT`/token) and **Google Search Console** (service account, per brand — verified live).
- The **Settings form saves metadata + a placeholder `secret_ref`** but does **not** store a usable secret, and nothing consumes it → LinkedIn/X/TikTok/Instagram/Facebook/OpenAI/Anthropic/DeepSeek/n8n/Telegram tiles are **scaffolds** (look configurable, aren't wired). `integration_configs` count is 0, confirming nobody relies on saved secrets yet.

### 🟠 C. Analytics is mostly mock
- `app/analytics` (+ `app/marketing/analytics`): only the **Search Console** panel is real. Channel Momentum, Click Attribution, Lead Quality, Top/Weak Content, and the sample StatCards are **hardcoded placeholders** clearly labelled "sample data."

### 🟡 D. Agent surface grew fast (reliability unknown)
- `lib/agents/` now has 15 modules (crina-runner, dispatch, team-runner, sub-agent-runner, crina-plan-rework, learning-store, visual-asset-generator, model-registry, agent-signals, agent-status, agent-config-store, agent-runs, hermes-client, hermes-registry, agent-catalog). Each agent call has a **deterministic fallback** (good for resilience, but means "it ran" can mean "placeholder output" when Hermes is down). Token/latency are captured; correctness of outputs is **not yet validated** against real briefs.
- Migrations are **idempotent `alter ... add column if not exists`** (fine), but schema has grown organically (visual_asset_*, workflow_stage, current_owner, etc.) — worth a consolidation pass.

---

## 3. Stubbed / incomplete features inventory

| Area | State | Notes |
|---|---|---|
| Crina weekly plan → content items | **Real** | Hermes + validated + deterministic fallback |
| Pipeline dispatch (idea→draft) + approvals (2 gates) | **Real** | Writes back to cards; market-aware suggested time |
| Agent Brain / Live Brain (observability) | **Real** | Reads `agent_runs`, signals, registry |
| Google Search Console analytics | **Real** | Per-brand, read-only, service account |
| Visual asset generation | **Partial** | Adapter exists (`visual-asset-generator.ts`, OpenAI image env) — verify it runs end-to-end |
| Analytics dashboards (non-GSC) | **Mock** | Sample data only |
| Social + model-provider connectors | **Scaffold** | Save metadata, no live API calls |
| Trading OS | **Missing** | Linked in nav/home, route 404 |
| Founder Ops | **Missing** | Linked in nav/home, route 404 |
| n8n / Telegram automation | **Scaffold** | Env present, not wired into the new flow |

---

## 4. Stability assessment

**✅ Keep (stable enough):**
- Toolchain/config (TS strict, build, lint, Tailwind), Supabase layer + local fallback, auth/admin gating, Crina plan → pipeline → approvals path, GSC connector, observability (Agent Brain), shared-brain/registry reader.

**🟠 Watch (works, but verify/harden):**
- Visual asset generator (confirm real output + cost guard), agent deterministic fallbacks (label clearly so "ran" ≠ "real"), Live Brain physics view (recently added), the growing `lib/agents` surface (needs a reliability pass + tests).

**🔴 Danger — redesign or remove before building more:**
- **Duplicate marketing routes** (`app/*` vs `app/marketing/*`) — consolidate now.
- **Broken `/trading` + `/founder` links** — add real routes or stop linking.
- **Scaffold connectors that look real** in Settings — either wire per-connector (GSC pattern) or visibly mark "not wired."
- **Mock analytics presented next to real GSC** — keep the "sample" labelling strict to avoid trusting fake numbers.

---

## 5. Stabilization phases (do these BEFORE the OS expansion)

> **Rule (user directive): do not create new features until S1 and S2 are complete.**
> Trading and Founder Ops are **S3**, gated behind S1+S2.

### Phase S1 — Build & run cleanly, no broken UX
- [ ] **Consolidate marketing routes**: choose `app/marketing/*` as canonical; **delete the orphaned top-level duplicates** (or convert `app/<x>` → `redirect("/marketing/<x>")`). One source of truth.
- [ ] **Fix broken nav**: either add minimal `app/trading` + `app/founder` placeholder pages ("No backend yet") **or** remove those nav/home links until S3. (Adding clearly-labelled placeholders is allowed as scaffolding, not a feature.)
- [ ] Verify `npm run dev` → every nav item loads with **no 404 and no console errors**.
- [ ] Keep build/tsc/lint green. Optionally run `npm audit` triage (3 moderate).

### Phase S2 — Make the core Marketing path solid
- [ ] End-to-end test the real path: Crina plan → Create Content Items → Pipeline "Send to agent" → draft written back → Approvals (gate 2) → Scheduled (suggested time). With Hermes up **and** down (fallback).
- [ ] Make agent **fallback outputs unmistakably labelled** in the UI (so placeholder ≠ trusted).
- [ ] Confirm **visual asset generation** runs end-to-end or mark it clearly partial.
- [ ] In Settings, **visually distinguish wired connectors (Hermes, GSC) from scaffolds**; stop implying social/model keys work.
- [ ] Tighten analytics: keep only the real GSC panel prominent; keep mock cards clearly "sample."
- [ ] Add a few smoke checks/tests for the agent runners (at least the fallback paths).

### Phase S3 — Only now: add Trading + Founder Ops
- [ ] Add `app/trading` (FX Scanner, Quant Lab, Risk Governor) and `app/founder` (daily review, tasks, research, investor tools) as real-looking dashboards, clearly "No backend yet", then wire to Hermes per `CODEX_PLAN.md`.

---

## 6. Quick wins (safe, high-value, do first in S1)
1. Delete or redirect the orphaned top-level marketing pages (removes drift instantly).
2. Add two placeholder pages for `/trading` and `/founder` so the existing nav/home links stop 404-ing.
3. Add a small "wired vs scaffold" badge in Settings so connector status is honest.
