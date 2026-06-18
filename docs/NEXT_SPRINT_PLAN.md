# Next Sprint Plan

Implementation brief for the next two sprints. Planning only — no code in this
document. Written while Codex implements the physics Live Brain, so the two
sprints below should be sequenced **after** that lands (they touch
`lib/agents/dispatch.ts` and `components/pipeline-board.tsx`, which overlap the
Live Brain work — coordinate merges).

> Current baseline (main @ 9d52562): Crina plan → content items → per-item
> dispatch (one assigned specialist) → draft written back → two approval gates →
> Scheduled with a suggested (manual) time. Live posting disabled.

## Implementation status (2026-06-18)

- **Sprint 2 (GSC) — STARTED (v1 shipped, uncommitted).** Decision confirmed:
  **Google Search Console** is the first connector. Implemented read-only,
  dependency-free (REST + env OAuth token), **no migration** (fetch-on-demand v1
  instead of the `0006` snapshot table — chosen to avoid touching
  `supabase/migrations/*` during the parallel Live Brain work and to lower risk).
  - Done: `lib/analytics/search-console.ts`, `GET /api/analytics/search-console/pull`,
    real Search Console panel on `/analytics`, live read-only test in
    `lib/integration-store.ts`, Settings now marks GSC **Recommended** and GA4
    "planned next" (`lib/integrations.ts` + `components/integration-settings.tsx`),
    env docs (`GOOGLE_SEARCH_CONSOLE_TOKEN`, `GOOGLE_SEARCH_CONSOLE_SITE`).
  - **Durable auth DONE:** service-account JWT (RS256 → token exchange, cached;
    Node `crypto`, no npm dep) in `lib/analytics/google-auth.ts`; the connector
    prefers the service account and falls back to a static token. Per-brand or
    shared SA supported.
  - Follow-ups: snapshot table (`0006`) for trends, then GA4 via the same pattern.
- **Sprint 1 (chaining) — DEFERRED** until Codex's physics Live Brain lands; it
  shares `lib/agents/dispatch.ts` + `components/pipeline-board.tsx` (do-not-touch
  now). Plan below is unchanged.

---

## GOVERNANCE — applies to BOTH sprints (do not weaken)

- **No live posting.** No social/network write calls. No browser automation for posting.
- **Publishing Agent prepares drafts only** and is excluded from auto-runs.
- **Human approval is required** before any item reaches `scheduled`/`published`.
  Agents may automate *production* (idea→brief→draft→visual); they may NOT
  auto-approve or auto-schedule.
- Analytics connectors are **read-only**. Request read-only scopes only.
- Secrets stay server-side. Never `NEXT_PUBLIC_*`; never returned to the browser;
  reuse the existing `secret_ref` pattern in `integration_configs`.
- Keep deterministic fallback for every agent path; never fabricate metrics
  (store `null`, not invented numbers).

---

# Sprint 1 — Agent chaining (SEO → Content Creator → Visual) on the same card

Today `dispatchContentItem` runs **one** specialist chosen by `keyForAgent(assigned_agent)`.
This sprint chains three production steps on a single content card, each reading
the previous step's structured output and writing back to the same record.

### Goal
A "Develop card" action runs, in order:
1. **SEO Agent** → keyword themes + brief (status `brief`).
2. **Content Creator Agent** → platform draft (body/hook/CTA) from the brief (status `draft`).
3. **Visual & Video Agent** → carousel/short-video direction (status `visual`).

Then the card lands in **Approvals** (gate #2) with `approval_status: "pending"`.
**No auto-approve, no scheduling.** Publishing stays out of the chain.

### Data flow
```
Pipeline card (idea/brief)
  → POST /api/agents/chain { contentItemId }
    → step 1 SEO        → runSubAgent(seo)        → persist brief + artifacts.seo
    → step 2 Content    → runSubAgent(content)    → persist body/hook/CTA + artifacts.content
    → step 3 Visual     → runSubAgent(visual)     → persist visual direction + artifacts.visual
    → set status=visual, approval_status=pending
  → card appears in Approvals (gate #2) → human approves → scheduled (suggested time)
```
Each step persists immediately after completing (resumable; a later failure does
not lose earlier work). Each step's structured JSON is stored under a new
`agent_artifacts` field so the next agent consumes real structure, not lossy text.

### Files likely touched
- `lib/agents/dispatch.ts` — extract step logic; reuse `mapOutputToPatch`. *(overlaps Live Brain work — coordinate)*
- `lib/agents/chain.ts` *(new)* — `chainContentItem(id, steps?)` orchestrator (sequential, persist-per-step).
- `lib/agents/agent-catalog.ts` — define the ordered chain (`chainKeys = ["seo","content-creator","visual-video"]`) and per-step input shaping.
- `app/api/agents/chain/route.ts` *(new)* — admin-gated POST; `runtime="nodejs"`, `maxDuration=300`.
- `components/pipeline-board.tsx` — add a "Develop card" button (alongside/replacing per-step "Send to agent"); per-step progress. *(overlaps Live Brain work — coordinate)*
- `lib/content-store.ts` — reuse `updateContentItem`; may add `appendArtifact(id, key, value)` helper.
- `lib/types.ts` — add `agent_artifacts?: Record<string, unknown> | null` to `ContentItem`.
- `app/content-pipeline/page.tsx` — pass any new fields.

### API route design
`POST /api/agents/chain`
- Auth: `requireAdmin` (browser, human-initiated).
- Body: `{ contentItemId: string, steps?: SubAgentKey[] }` (default `["seo","content-creator","visual-video"]`).
- Behavior: load item → run steps in order, each writing back + recording an
  `agent_run` (existing observability) + signals → return `{ ok, item, steps:[{agent,provider,status}] }`.
- Errors: if a step fails, persist prior steps, return `207`-style partial result
  with `error`; the card keeps the furthest status reached.
- Headers: `x-agent-provider`, and **never** any posting capability.

### Supabase schema changes
- Migration `0005_content_item_artifacts.sql`: `alter table content_items add
  column if not exists agent_artifacts jsonb;` (nullable). No other changes.
- `agent_runs` already captures per-step observability — no change.

### Risks
- **Long runtime**: 3× Hermes (~2–3 min). Mitigate: persist-per-step, `maxDuration`,
  clear per-step UI progress; consider a future background/job mode.
- **Partial failure** mid-chain → must be resumable (re-run from current status).
- **Token cost** triples per card; surface a `token_budget` signal (already exists).
- **`assigned_agent` semantics**: chaining ignores a single assignee — keep
  `assigned_agent` as the "owner" label; the chain is explicit.
- **Mapping drift**: each step must read prior artifacts, not re-derive from scratch.
- **Governance**: ensure the chain never sets `approved`/`scheduled`; it stops at
  `visual` + `pending`.

### Test checklist
- [ ] `npm run build`, `npm run lint`, `npm run check:supabase` pass.
- [ ] Run migration `0005`; `agent_artifacts` present and nullable.
- [ ] Develop a Crina idea card → ends at status `visual`, `approval_status=pending`, body/hook/CTA + visual direction populated, `agent_artifacts.{seo,content,visual}` set.
- [ ] Card appears in Approvals; approving → `scheduled` with suggested time; **never** auto-approved.
- [ ] Hermes-down path: deterministic fallback for each step; run still completes; signals raised.
- [ ] Mid-chain failure leaves earlier steps persisted; re-run resumes.
- [ ] Observability: one `agent_run` per step with model/tokens/latency/handoff.
- [ ] No network calls to any social platform (grep).

---

# Sprint 2 — First real analytics connector

## Recommendation: **Google Search Console (GSC)** first

**Why GSC over GA4 (lowest risk, highest fit):**
- **Read-only by nature** — Search Analytics API needs only `webmasters.readonly`.
- **No PII** — aggregate query/page metrics (clicks, impressions, CTR, position);
  GA4 carries user-level/consent/PII concerns.
- **Tighter surface** — one API, simple dimensions (query, page, date, country);
  GA4 requires property IDs + a larger metric/dimension model.
- **Closes the marketing loop** — GSC performance maps directly to the SEO Agent's
  briefs (queries/keywords), feeding Crina's reporting. GA4 is a good *second*.

Do GSC now; keep GA4 as the next analytics sprint using the same pattern.

### Data flow
```
Settings → store GSC service-account credentials (secret_ref, server-only)
  → POST /api/analytics/search-console/pull { brandId, range }   (admin, read-only)
    → server fetches Search Analytics for the brand's verified domain
    → store snapshot (analytics_snapshots)  [no PII]
  → Analytics page renders real metrics (replaces mock)
  → (optional) Analytics Agent summarizes snapshot → signal/report to Crina
```

### Files likely touched
- `lib/integrations.ts` — `google-search-console` provider already exists; refine description.
- `lib/integration-store.ts` — add a real read-only `testIntegration("google-search-console")` health check (verify creds + site access).
- `lib/analytics/search-console.ts` *(new)* — read-only client: auth via service account, `searchanalytics.query`.
- `app/api/analytics/search-console/pull/route.ts` *(new)* — admin-gated GET/POST; pulls + stores a snapshot.
- `app/analytics/page.tsx` — render real GSC metrics when configured; keep mock fallback when not.
- `lib/types.ts` — `AnalyticsSnapshot` type.
- `.env.example` — document `GOOGLE_APPLICATION_CREDENTIALS` / service-account path (server-only).

### API route design
`POST /api/analytics/search-console/pull`
- Auth: `requireAdmin`.
- Body: `{ brandId: string, startDate?, endDate?, dimensions?: ["query"|"page"|"date"|"country"] }`.
- Behavior: resolve brand domain → call Search Analytics (read-only) → upsert a
  snapshot → return rows. Never writes to Google.
- Failure: clean error if creds/site missing; Analytics page shows "not connected".

### Supabase schema changes
- Migration `0006_analytics_snapshots.sql`:
  ```
  analytics_snapshots(
    id uuid pk, provider text, brand_id uuid, range_start date, range_end date,
    dimensions jsonb, metrics jsonb, pulled_at timestamptz, created_at timestamptz
  )  -- RLS admin-gated, same policy pattern as agent_runs
  ```
- Alternatively (lighter) write a short summary into `content_items.performance_summary`
  for matched URLs; the snapshot table is preferred for trends.

### Risks
- **Secrets**: service-account JSON must be server-only; never `NEXT_PUBLIC`; store
  a reference, not the raw key, in `integration_configs.secret_ref`.
- **Auth/setup**: domain verification + service-account access to the GSC property;
  document clearly. Read-only scope only.
- **Rate limits / freshness**: GSC data lags ~2–3 days; cache snapshots, don't poll hot.
- **RLS**: snapshots admin-gated; use service-role client for server pulls (same
  pattern as `agent_runs`).
- **Scope creep**: resist adding GA4/social in the same sprint.

### Test checklist
- [ ] `npm run build`, `npm run lint`, `npm run check:supabase` pass.
- [ ] Run migration `0006`; `analytics_snapshots` present, RLS on.
- [ ] Settings: save GSC creds → `testIntegration` returns connected/testable; secret never echoed.
- [ ] Pull endpoint returns real rows for a verified brand domain; stores a snapshot.
- [ ] Analytics page shows real metrics when configured, mock fallback when not.
- [ ] No write calls to Google; read-only scope verified.
- [ ] No secret value appears in any response, log, page, or `agent_runs`.

---

## Sequencing note
1. Land Codex's physics Live Brain first (it edits `live-brain.tsx`, `system-map`,
   and may touch `dispatch.ts`/`pipeline-board.tsx`).
2. Then Sprint 1 (chaining) — shares `dispatch.ts` + `pipeline-board.tsx`; rebase on Live Brain.
3. Then Sprint 2 (GSC) — mostly additive (new analytics module + route + table).
