# Agent Interconnections — Marketing chain

How the marketing agents connect, how context passes through the shared brain, and
how Hermes coordinates the chain. Implementation reference for Codex.

**Key principle (do not forget):** Hermes does **not** natively route to agent IDs.
The **Next.js runners are the orchestrator/sequencer**; **Hermes is the stateless
LLM execution engine**, called once per step via `lib/agents/hermes-client.ts`
(`runHermesAgent`) with the target agent's identity + brain context injected and a
strict JSON schema demanded. Persistent state between steps lives in the **shared
brain** (`HERMES_BRAIN_PATH`) and **Supabase** (`content_items`, `agent_runs`).

Kept modules Codex uses for every agent call:
- `runHermesAgent(options)` — `lib/agents/hermes-client.ts`
- `recordAgentRun(input)` — `lib/agents/agent-runs.ts` (writes `agent_runs`)
- `buildBrainContext(only?)`, `getHermesAgentProfile(id)`, `agentMemoryFileName(id)` — `lib/agents/hermes-registry.ts`
- `resolveAgentModel(id, fallback)` — `lib/agents/agent-config-store.ts`

> The archived `_archive/lib/agents/sub-agent-runner.ts` shows the exact wrapper
> pattern (runHermesAgent → map output → recordAgentRun → emit signals → fallback).
> Port it into the rebuilt marketing code; do not import from `_archive/`.

---

## 1. The canonical chain

```
Crina (plan)                                    ← strategy / weekly plan
   │  writes content_items (status: idea|brief)
   ▼
[Human: review plan → dispatch each card]        ← APPROVAL GATE 0 (greenlight)
   │
   ├─ Competitor Intelligence ─┐  (winning patterns / angles)
   ├─ SEO ────────────────────┤  (keyword themes / blog brief)
   ├─ Content Creator ─────────┤  (platform drafts: hook/body/CTA)
   └─ Visual & Video ──────────┘  (carousel / video / creative direction)
   │  each writes its output back onto the SAME content_item, advances status
   ▼
[Human: Approvals] ──────────────────────────────  ← APPROVAL GATE 1
   │  approved → status: scheduled (+ market-aware suggested time)
   ▼
Publishing Agent (draft package only) ───────────  ← never publishes
   │
   ▼
[Human: manual posting]  →  Analytics ───────────► back to Crina (reporting)
```

Dispatch model (today): one specialist runs per card, chosen by `assigned_agent`
(`lib/agents/dispatch.ts` pattern, archived). Chaining several specialists on one
card is allowed but each step persists independently and is resumable.

---

## 2. Agent registry + chain table

Agent IDs come from `team.json` (`HERMES_TEAM_PATH`). Each agent reads shared brain
files + its own memory file `agent-<id>-memory.md` (`HERMES_BRAIN_PATH`).

| Agent | id | Receives (input) | Produces (output) | Next |
|---|---|---|---|---|
| **Crina** (CEO) | `agent-crina` | brand/campaign context, week, platforms, intensity, human notes | weekly plan → `content_items` (idea/brief) | Human → dispatch |
| **Competitor Intelligence** | `agent-competitor-intelligence` | brief + brand context + competitor targets | winning patterns, hook skeletons, angles | SEO |
| **SEO** | `agent-seo` | brief + brand + competitor angles | keyword themes, SERP angles, blog brief, tech recs | Content Creator |
| **Content Creator** | `agent-content-creator` | brief/SEO/competitor + brand voice | platform drafts (hook/body/CTA), claims to review | Visual or Approvals |
| **Visual & Video** | `agent-visual-video` | draft + brand | carousel concepts, video scripts, storyboards, asset notes | Approvals |
| **Publishing** | `agent-publishing` | approved content_item | platform-ready **draft package** (never posts) | Human (manual) |
| **Analytics** | `agent-analytics` | performance data (GSC real; rest sample) | summary, top/weak content, next-best actions | Crina |

---

## 3. Per-agent I/O contracts (exact)

Call shape for every specialist (via `runHermesAgent`):
```
input = {
  contentItemId: string,
  brief: { title, hook, body, platform, content_type, CTA },
  brand: { name, positioning, tone, audience },
  upstream?: <previous agent output, when chained>,
  instruction: string
}
```

**Crina** — input `WeeklyContentPlanInput { brand, campaignObjective, targetAudience, weekStartDate, platforms[], contentIntensity, humanNotes }` + context `{ brands[], campaigns[] }`.
Output `WeeklyContentPlanOutput`:
```json
{ "workflowName":"Generate Weekly Content Plan","generatedBy":"Crina","weekStartDate":"YYYY-MM-DD","summary":"string",
  "items":[{ "id":"string","brand_id":"string","brandName":"string","campaign_id":"string","platform":"LinkedIn|X|Instagram|Facebook|Blog","content_type":"string","title":"string","hook":"string","body":"string","CTA":"string","assigned_agent":"string","status":"idea|brief" }] }
```

**Competitor Intelligence** output:
```json
{ "agent":"Competitor Intelligence Agent",
  "winningPatterns":[{ "sourceLabel":"string","hookSkeleton":"string","audiencePromise":"string","proofAngle":"string","CTA":"string","platformFit":"string","whyItWorked":"string","adaptFor":"string","riskNotes":["string"] }],
  "recommendedAngles":["string"], "handoffTo":"SEO Agent" }
```

**SEO** output:
```json
{ "agent":"SEO Agent","brandName":"string","searchObjective":"string",
  "keywordThemes":[{ "theme":"string","intent":"informational|commercial|navigational|transactional","priority":"high|medium|low","rationale":"string" }],
  "serpAngles":["string"],
  "blogBrief":{ "title":"string","outline":["string"],"targetKeyword":"string","audience":"string","proofNeeded":["string"],"internalLinks":["string"],"cta":"string" },
  "technicalRecommendations":["string"], "handoffTo":"Content Creator Agent" }
```

**Content Creator** output:
```json
{ "agent":"Content Creator Agent","platform":"LinkedIn|X|Instagram|Facebook|Blog",
  "drafts":[{ "title":"string","hook":"string","body":"string","CTA":"string","variant":"primary|sharper|conservative","claimsToReview":["string"] }],
  "visualOpportunities":["string"], "status":"draft","notes":"string" }
```
→ written back to the card: `body`, `hook`, `CTA`, `status="draft"`.

**Visual & Video** output:
```json
{ "agent":"Visual & Video Agent",
  "carouselConcepts":[{ "title":"string","slides":[{ "slide":1,"headline":"string","visualDirection":"string","supportingCopy":"string" }] }],
  "shortVideoScripts":[{ "title":"string","beats":["string"],"durationSeconds":30,"onScreenText":["string"],"voiceover":"string" }],
  "storyboardBriefs":["string"], "assetNotes":["string"] }
```
→ written back: `content_type="Creative direction"`, `status="visual"`.

**Publishing** output (draft only — `published` is always `false`):
```json
{ "agent":"Publishing Agent","platform":"string",
  "draftPackage":{ "title":"string","body":"string","formattedFor":"string","assets":["string"] },
  "suggestedScheduleMetadata":{ "suggestedTime":"ISO","timezone":"IANA" },
  "readinessChecklist":["string"], "published":false, "status":"draft" }
```

**Analytics** output:
```json
{ "agent":"Analytics Agent","summary":"string","topContent":["string"],"weakContent":["string"],"nextBestActions":["string"] }
```

---

## 4. Context passing via the shared brain (`HERMES_BRAIN_PATH`)

The brain dir holds **shared** markdown (read by many agents) + **per-agent memory**
(`agent-<id>-memory.md`). `runHermesAgent` auto-includes the agent's own memory file
and any `brainFiles` you pass; `buildBrainContext()` reads + budget-truncates them
into the system prompt (server-side only, never returned to the browser).

**Shared files:** `brand-briefs.md`, `voice-calendar-memory.md`, `content-intelligence-patterns.md`, `draft-publishing-safety.md`, `workflow-contract.md`, `token-model-policy.md`, `README.md`.

**`brainFiles` per agent (pass these in options):**
| Agent | brainFiles |
|---|---|
| Crina | (all shared) + `agent-crina-memory.md` |
| Competitor Intel | `content-intelligence-patterns.md`, `brand-briefs.md`, `agent-competitor-intelligence-memory.md` |
| SEO | `brand-briefs.md`, `content-intelligence-patterns.md`, `workflow-contract.md`, `agent-seo-memory.md` |
| Content Creator | `brand-briefs.md`, `voice-calendar-memory.md`, `workflow-contract.md`, `agent-content-creator-memory.md` |
| Visual & Video | `brand-briefs.md`, `voice-calendar-memory.md`, `draft-publishing-safety.md`, `agent-visual-video-memory.md` |
| Publishing | `draft-publishing-safety.md`, `workflow-contract.md` |
| Analytics | `voice-calendar-memory.md`, `workflow-contract.md` |

**Write-back (learning loop):** when a human rejects/edits at an approval gate, the
decision + feedback is appended to the relevant agent's `agent-<id>-memory.md`
(pattern in `_archive/lib/agents/learning-store.ts` — port it). Next run, that memory
is injected, so feedback compounds. Cross-agent context (e.g., SEO brief → Content
Creator) passes via the `input.upstream` field **and** is summarized into shared
files for durability — large transcripts are not stored (see `token-model-policy.md`).

---

## 5. Hermes's coordination role

Hermes is stateless per call. Coordination responsibilities split:

| Concern | Owner | Mechanism |
|---|---|---|
| **Sequencing** | Next.js runner | Dispatch by `assigned_agent`; optional chain runs steps in order, persisting each |
| **Identity routing** | `hermes-client` | Injects agent id/role/allowed+blocked actions into the system prompt (endpoint is generic) |
| **Model + retry** | `hermes-client` | `resolveAgentModel` (per-agent override → env default); primary model → **backup model** on failure |
| **Strict output** | `hermes-client` | `response_format: json_object` + schema; parses, repairs `{…}`, else throws |
| **Fallback** | runner | On `ok:false`, use deterministic stub output, **badge FALLBACK**, still `recordAgentRun(status:"fallback")` |
| **Observability** | `recordAgentRun` | Every run → `agent_runs` (model, tokens, duration_ms, provider_response_status, handoff_from/to, brain_resources_used) |
| **Human gates** | UI + `approvals` | No step auto-approves; publishing never posts |

**Retry/fallback sequence per step:**
1. `runHermesAgent` calls primary model → on non-OK/timeout, retries **backup model**.
2. If still not OK → runner produces **deterministic output**, badged `FALLBACK`.
3. Always `recordAgentRun` (`success` | `fallback` | `error`) with full observability.
4. Live Brain / Agents screen reflects state from `agent_runs`.

**Timeouts/limits:** `HERMES_AGENT_TIMEOUT_MS`; brain context budget-capped; no large transcripts persisted.

---

## 6. Quick chain reference

```
Crina ─plan→ content_items
   Competitor Intel ─angles→ SEO ─brief→ Content Creator ─draft→ Visual ─creative→ Approvals(Human) ─approved→ Publishing(draft) ─manual→ Analytics ─report→ Crina
```
Every arrow = one `runHermesAgent` call + one `agent_runs` row + brain read; human
gates at "dispatch" and "Approvals". Governance: drafts only, no live posting.
