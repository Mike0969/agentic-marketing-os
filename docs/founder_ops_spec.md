# Founder Ops Agents — Spec

Precise contracts for the four Founder Ops agents. Codex implements directly (see
`CODEX_PLAN.md` F1, after Marketing + Phase 1.5 + Trading). **Governance (absolute):
decision support only — these agents produce briefs, drafts, and recommendations;
the human decides and acts.** No autonomous actions, no sending, no publishing.

## Shared conventions (all founder agents)
- **Call path:** resolve `{provider, model}` from `agent_config` → `agent_settings` → env, then `callModel(...)` (`lib/providers/call-model.ts`: Hermes via `hermes-client.ts`, else `lib/providers/<provider>.chat()`). Never call providers directly from a screen.
- **Logging:** every run → `recordAgentRun(...)` → `agent_runs` (`agent_id`, `agent_name`, `workflow_name`, `provider`, `model`, tokens, `duration_ms`, `status`).
- **Fallback:** on `ok:false`, return a deterministic stub badged **FALLBACK** in the UI; still log `status:"fallback"`. Never fabricate facts/sources in fallback — use empty arrays + a clear note.
- **Registry:** add each agent to `team.json` with `blocked_actions:["no autonomous actions","decision support only"]`; brain file `founder-brief.md` (founder priorities, companies, investor context) + per-agent memory `agent-<id>-memory.md`.
- **Output envelope:** every output JSON includes `"agent"`, `"generatedAt"` (ISO), and `"disclaimer":"Decision support only. The human decides and acts."`
- **Data source:** Supabase data is gathered by the runner and passed in `input`; agents do not query the DB or browse the web unless a tool is explicitly added.

---

## 1. Founder Operator — `agent-founder-operator`

**Role:** executive synthesizer across all domains; produces the founder's brief, priorities, and decisions-needed.

**Input:**
```json
{
  "currentDate":"YYYY-MM-DD",
  "openTasksCount": 0,
  "recentRunsSummary":[{ "domain":"marketing|trading|founder","agent":"string","status":"success|fallback|error","workflow":"string","at":"ISO" }],
  "activeResearchTopics":["string"]
}
```

**Output schema (strict):**
```json
{
  "agent":"Founder Operator","generatedAt":"ISO",
  "daily_brief":"≤1200 chars executive narrative",
  "priorities":["string"],
  "decisions_needed":["string"],
  "cross_domain_summary":{ "marketing":"string","trading":"string","founder":"string" },
  "disclaimer":"Decision support only. The human decides and acts."
}
```

**Call pattern:** `callModel({ agentId:"agent-founder-operator", task:"Founder daily operator brief", system:<role+governance>, user:JSON.stringify(input), jsonSchema:<above>, brainFiles:["founder-brief.md","agent-founder-operator-memory.md"], temperature:0.3 })`.
**Guardrails:** synthesis only; `decisions_needed` are framed for the human; never marks a decision as made. `workflow_name:"Founder Operator Brief"`.

---

## 2. Daily Review — `agent-daily-review`

**Role:** generate a structured morning brief from **real** cross-domain Supabase data.

**Runner gathers** before the call: `getAgentRuns(undefined, 5)` (all domains), pending `content_items` (status `approval` or `approval_status="pending"`), latest `fx_signals.created_at`. Pass as `input`:
```json
{
  "date":"YYYY-MM-DD",
  "agentRuns":[{ "agent":"string","domain":"string","status":"string","workflow":"string","at":"ISO" }],
  "pendingApprovals":[{ "title":"string","brand":"string","stage":"string" }],
  "lastFxScanAt":"ISO|null"
}
```

**Output schema (strict):**
```json
{
  "agent":"Daily Review","generatedAt":"ISO","date":"YYYY-MM-DD",
  "marketing_status":"≤300 chars (pipeline + approvals state)",
  "trading_status":"≤300 chars (last scan recency + flags; research only)",
  "founder_tasks":["string"],
  "alerts":["string"],
  "disclaimer":"Decision support only. The human decides and acts."
}
```

**Call pattern:** `callModel({ agentId:"agent-daily-review", task:"Daily review brief", ..., jsonSchema:<above>, brainFiles:["founder-brief.md","agent-daily-review-memory.md"], temperature:0.2 })`.
**Guardrails:** summarizes provided data only — no invented metrics; `alerts` flag stale scans / overdue approvals / error runs. `workflow_name:"Daily Review"`.

---

## 3. Research — `agent-research`

**Role:** structured research synthesis on a topic, tied to a project context.

**Input:**
```json
{
  "topic":"string",
  "context":"string (what's known / why it matters)",
  "relevance_to":["gridfactory","gulf-el","trading","general"]
}
```
Standing topics: *Chinese EV market entry Europe*, *data center economics GPU clusters*, *UAE/GCC regulatory frameworks*, *options trading strategies*.

**Output schema (strict):**
```json
{
  "agent":"Research","generatedAt":"ISO",
  "summary":"string",
  "key_findings":["string"],
  "sources":["string (reference/citation; mark 'model knowledge — verify' when not from supplied context)"],
  "action_items":["string"],
  "disclaimer":"Decision support only. The human decides and acts."
}
```

**Call pattern:** `callModel({ agentId:"agent-research", task:"Research synthesis", ..., jsonSchema:<above>, brainFiles:["founder-brief.md","agent-research-memory.md"], temperature:0.4 })`.
**Guardrails:** no live web browsing unless a search tool is wired — `sources` must be labelled `model knowledge — verify` when not derived from `context`; never present unverified claims as fact. Persist to `research_notes`; append durable learnings to `agent-research-memory.md`. `workflow_name:"Research"`.

---

## 4. Investor Tools — `agent-investor-tools`

**Role:** draft investor updates / deck sections. Drafts only — finance/claims need human + legal review.

**Input:**
```json
{ "project":"gridfactory|gulf-el", "update_type":"weekly|milestone|deck-section" }
```
(The runner injects the brand's `approval_rules` + `proof_points` from the `brands` table as context.)

**Output schema (strict):**
```json
{
  "agent":"Investor Tools","generatedAt":"ISO",
  "draft":"string",
  "key_metrics":["string (placeholder/needs-verification flagged)"],
  "talking_points":["string"],
  "next_steps":["string"],
  "disclaimer":"Decision support only. The human decides and acts."
}
```

**Call pattern:** `callModel({ agentId:"agent-investor-tools", task:"Investor update draft", ..., jsonSchema:<above>, brainFiles:["founder-brief.md","brand-briefs.md","agent-investor-tools-memory.md"], temperature:0.4 })`.
**Guardrails:** honor the brand's `approval_rules` (e.g. GridFactory: *no financial claims without legal review, no unverified capacity numbers*; Gulf-EL: *no pricing/market-share claims without ops confirmation*). Flag any metric needing verification. Drafts only. Persist to `investor_items`. `workflow_name:"Investor Draft"`.

---

## Supabase tables (created in F1; RLS admin-gated, same pattern as existing tables)
```sql
founder_tasks(   id uuid pk default gen_random_uuid(), title text not null, status text not null default 'open'
                 check (status in ('open','in_progress','blocked','done')), domain text, due_date date, notes text,
                 created_at timestamptz not null default now() )

decisions(       id uuid pk default gen_random_uuid(), title text not null, context text, decision text,
                 decided_by text, decided_at timestamptz, status text not null default 'pending'
                 check (status in ('pending','decided','deferred')), created_at timestamptz not null default now() )

research_notes(  id uuid pk default gen_random_uuid(), topic text not null, relevance_to text[],
                 summary text, key_findings jsonb, sources jsonb, action_items jsonb, run_id uuid,
                 created_at timestamptz not null default now() )

investor_items(  id uuid pk default gen_random_uuid(), project text not null check (project in ('gridfactory','gulf-el')),
                 update_type text not null check (update_type in ('weekly','milestone','deck-section')),
                 draft text, key_metrics jsonb, talking_points jsonb, next_steps jsonb, status text not null default 'draft',
                 run_id uuid, created_at timestamptz not null default now() )
```
RLS: `enable row level security` + grants to `authenticated` + `admin read/write` policies using `public.is_admin()` (copy 0002/0004 pattern). Migration file `supabase/migrations/00XX_founder_ops.sql` to be created when F1 starts.

## Shared brain reads/writes
- All read `founder-brief.md` + their own `agent-<id>-memory.md`.
- Investor Tools also reads `brand-briefs.md`.
- Research + Daily Review append durable summaries to their memory files (port the `_archive/lib/agents/learning-store.ts` pattern). No large transcripts persisted (`token-model-policy.md`).

All four: decision support only, logged to `agent_runs`, fallbacks badged, every output carries the `disclaimer`. No autonomous sending/posting/execution anywhere.
