# Agentic Marketing OS — Full Implementation Plan

Status: review draft for Codex, Claude, and Hermes agents.

This file is the working plan to make the **Marketing** tab of the Agentic OS
usable as a real campaign command center.

Canonical product rule:

```text
Human creates/approves campaign objective
  -> Crina orchestrates all marketing agents
  -> machine loops happen internally
  -> Crina assembles final campaign package
  -> human approves once before publishing prep
  -> Publishing Agent prepares drafts only
```

No live posting. No autonomous publishing. No cross-brand leakage.

## 0. Current State

Already done:

- Next.js App Router, TypeScript, Tailwind, Supabase, auth, RLS, local fallback
  foundation exist.
- Marketing pages exist:
  - `/marketing`
  - `/marketing/brands`
  - `/marketing/campaigns`
  - `/marketing/pipeline`
  - `/marketing/approvals`
  - `/marketing/analytics`
  - `/marketing/agents`
- Brands, campaigns, content items, approvals, agent runs, provider/model config,
  GSC connector, and settings infrastructure exist.
- Provider-aware execution exists for marketing agent runs.
- `agent_config` lets agents use different provider/model assignments.
- SEO Loop works as a technical subsystem:
  - SEO builder drafts,
  - Crina reviews,
  - up to three internal loops,
  - output goes to human queue,
  - feedback memory is persisted.
- Campaign-centric product spec exists:
  - `docs/marketing-campaign-orchestration-spec.md`

Important correction:

When Codex previously said "Step 1 done", that meant only the product direction
was documented and committed. It did **not** mean the Marketing UI or workflows
had already changed.

Known mismatch:

- `/marketing` still exposes direct SEO Loop behavior.
- Campaigns are not yet the true operator start point.
- Pipeline is still closer to content-item/task tracking than campaign progress.
- Approvals do not yet cleanly separate campaign direction approval from final
  package approval.
- Crina does not yet autonomously run the full campaign chain.

## 1. Product Target

The operator should experience the Marketing tab like this:

1. Choose brand: GridFactory.io or Gulf-EL.com / NexRide.
2. Create a campaign objective/source.
3. Approve the campaign direction once.
4. Crina runs SEO/content/visual/publishing-prep loops internally.
5. Pipeline shows where the campaign is and which agent owns it.
6. Crina assembles one final package.
7. Human approves/rejects once at the final gate.
8. Publisher prepares platform-ready drafts only.
9. Feedback and performance data improve future campaigns.

The 7-day social automation pattern is embedded as a campaign template:

```text
source/objective
  -> angles
  -> platform-specific posts
  -> visual concepts
  -> 7-day calendar
  -> review
  -> publishing prep
  -> weekly performance learning
```

## 2. Non-Negotiable Rules

- Marketing agents produce drafts and packages only.
- Nothing posts live.
- Publishing Agent may format and prepare, not publish.
- Human approval is required:
  - before campaign execution,
  - before publishing prep.
- GridFactory and Gulf-EL / NexRide remain separate unless cross-brand is
  explicitly enabled.
- Every agent/model call logs to `agent_runs`.
- Fallback output is visibly labeled `FALLBACK`.
- Demo/sample analytics are visibly labeled `SAMPLE DATA` or `DEMO`.
- Provider keys stay server-side.
- Claude should not code in the same Marketing files while Codex is coding
  unless explicitly assigned a separate, non-overlapping task.

## 3. Brand Scope Rules

Default:

- Every campaign has one primary `brand_id`.
- Agents receive only that brand's context.
- Memory is filtered by brand where possible.
- Cross-brand campaign execution is disabled.

Required brand context per agent:

- name
- website
- positioning
- target audience
- tone of voice
- pillars
- SEO targets
- CTAs
- approval rules
- relevant past feedback memory

Cross-brand mode:

- Must be explicitly enabled.
- Crina must state why both brands are involved.
- Outputs must remain clearly separated by brand.
- Claims and CTAs must remain brand-specific.

## 4. Agent Roles

### Crina — Marketing CEO Agent

Owns strategy, sequencing, quality review, agent assignment, and final package.

Crina can:

- interpret campaign objectives,
- extract content angles,
- choose required agents,
- review internal outputs,
- send weak work back with specific reasons,
- assemble final package,
- escalate to human if blocked.

Crina cannot:

- publish live,
- bypass final approval,
- mix brands without explicit cross-brand setting,
- make unverified claims.

### SEO Agent

Internal campaign execution agent for search-oriented work.

Produces:

- keyword themes,
- search intent,
- blog/article brief,
- metadata suggestions,
- SEO content draft,
- site/content recommendations.

SEO Loop belongs here as an internal quality loop, not as the main operator
workflow.

### Content Creator Agent

Turns campaign strategy into channel-specific copy.

Produces:

- LinkedIn post drafts,
- X posts/threads,
- Instagram/TikTok/YouTube captions,
- Facebook/community-style posts,
- blog draft expansion,
- hooks,
- CTAs,
- claims-to-review.

### Visual & Video Agent

Creates creative direction and future generation requests.

Produces:

- carousel concepts,
- quote-card concepts,
- infographic ideas,
- image prompts,
- short video scripts,
- storyboard beats,
- asset notes.

Future capability-aware generation should use models with:

- `image_generation`
- `video_generation`

Until fully wired, generated image/video actions must be clearly labeled
`COMING SOON` or `DRAFT ASSET`.

### Competitor / Research Agent

Finds content patterns and useful angles.

Produces:

- hook skeletons,
- competitor references,
- reusable angle patterns,
- risks,
- platform-fit notes.

This agent should be read/research only.

### Publishing Agent

Prepares platform-ready drafts only.

Produces:

- formatted captions,
- hashtags,
- asset checklist,
- platform-specific package,
- suggested schedule metadata,
- readiness checklist.

Blocked:

- no OAuth posting,
- no scheduling without approval,
- no live post.

### Analytics Agent

Feeds learning back into campaign planning.

Produces:

- weekly performance summary,
- best hooks,
- weak hooks,
- platform performance notes,
- CTA performance,
- recommendations for Crina.

GSC data is real. Other analytics remain sample/demo until integrated.

## 5. Desired Data Model Direction

Do not overbuild, but the current tables need a campaign orchestration layer.

Use existing tables where possible:

- `brands`
- `campaigns`
- `content_items`
- `approvals`
- `agent_runs`
- `feedback_memory`
- `content_queue`
- `agent_config`

Likely new or extended fields:

### Campaign orchestration fields

On `campaigns` or a new campaign execution table:

- `source_material`
- `platforms`
- `primary_cta`
- `campaign_stage`
- `current_owner`
- `direction_approval_status`
- `final_approval_status`
- `cross_brand_enabled`
- `execution_started_at`
- `final_package_id`
- `last_crina_summary`

Recommended campaign stages:

```text
draft_objective
awaiting_direction_approval
approved_for_execution
extracting_angles
with_research_agent
with_seo_agent
with_content_agent
with_visual_agent
with_crina_review
assembling_final_package
awaiting_final_approval
approved_for_publishing_prep
with_publishing_agent
ready_scheduled_draft
needs_rework
rejected
completed
```

### Campaign package concept

A final package should store:

- campaign id,
- brand id,
- summary,
- angles,
- platform posts,
- blog/SEO output,
- visual/video concepts or assets,
- calendar,
- CTA,
- suggested schedule,
- risk notes,
- fallback/provider/model notes,
- approval status.

This can start as JSON in a campaign execution table, then become normalized if
needed later.

### Agent task concept

Internal agent task records should store:

- campaign id,
- agent id,
- task type,
- status,
- input summary,
- output JSON,
- loop iteration,
- provider,
- model,
- fallback used,
- run id,
- started/completed timestamps.

This makes Pipeline and Live Brain honest.

## 6. API Roadmap

### Campaign objective APIs

Needed behavior:

- create/update campaign objective,
- submit for direction approval,
- approve/reject/request changes,
- start Crina execution after approval.

Suggested endpoints:

```text
POST /api/marketing/campaign-objectives
PATCH /api/marketing/campaign-objectives/[id]
POST /api/marketing/campaign-objectives/[id]/submit
POST /api/marketing/campaign-objectives/[id]/decision
```

### Crina campaign execution API

Needed behavior:

- run Crina orchestration for an approved campaign,
- update campaign stage/current owner,
- call sub-agents,
- assemble final package,
- log every run.

Suggested endpoint:

```text
POST /api/marketing/campaigns/[id]/execute
```

Rules:

- execution only allowed after direction approval,
- each model call uses provider-aware runner path,
- each model call logs to `agent_runs`,
- fallback is stored and surfaced,
- no live publishing.

### Campaign final approval API

Needed behavior:

- list final packages waiting for approval,
- approve/reject/request changes,
- write feedback memory,
- if approved, start Publishing Agent draft prep.

Suggested endpoints:

```text
GET /api/marketing/final-approvals
POST /api/marketing/final-approvals/[packageId]/decision
```

### SEO Loop API adjustment

Current:

```text
POST /api/marketing/seo-loop
```

Future:

- keep for admin diagnostics,
- add optional `campaign_id`,
- when campaign_id is provided, output attaches to campaign execution package,
- remove/de-emphasize direct operator launcher.

## 7. UI Roadmap

### `/marketing`

Purpose:

Campaign command center.

Change from:

- direct SEO Loop launcher,
- module cards.

Change to:

- primary action: `Create Campaign Objective`,
- status metrics:
  - draft objectives,
  - awaiting direction approval,
  - in execution,
  - awaiting final approval,
  - ready for publishing prep,
- recent Crina decisions,
- recent agent runs,
- clear governance banner:
  `Drafts only. Nothing posts without final approval.`

SEO Loop can remain as a small admin/diagnostic link later, not the main CTA.

### `/marketing/campaigns`

Purpose:

Campaign source of truth.

Needs:

- campaign objective creation/editing,
- brand selector,
- source material field,
- platform selector,
- CTA field,
- direction approval status,
- execution stage,
- current owner,
- final package status,
- campaign detail drawer/page.

Operator should start work here.

### `/marketing/pipeline`

Purpose:

Answer: "Where is my campaign now?"

Needs:

- campaign-level cards,
- stage columns,
- current owner badge,
- provider/model/fallback badges,
- expand to see internal agent tasks,
- no overwhelming list of every tiny idea by default.

Recommended columns:

```text
Approved
Research / SEO
Content
Visual
Crina Review
Final Package
Human Approval
Publishing Prep
Ready
Needs Rework
```

### `/marketing/approvals`

Purpose:

Human decision desk only.

Needs two sections:

1. Campaign direction approvals
2. Final pre-publish package approvals

Each approval card should show:

- brand,
- objective,
- current status,
- Crina summary,
- what decision is needed,
- approve/reject/request changes,
- reason input for rejection/change request.

Do not show internal SEO/content/visual loops here unless Crina escalates.

### `/marketing/agents`

Purpose:

Agent status and model control.

Needs:

- each marketing agent,
- provider/model,
- last run,
- fallback/error status,
- memory status,
- "used in campaign" trace,
- model switcher remains connected to `agent_config`.

### `/marketing/analytics`

Purpose:

Performance learning.

Needs:

- GSC real panel stays real,
- all other sample panels clearly labeled,
- feedback into Crina memory,
- weekly learning summary for future campaigns.

## 8. Step-by-Step Implementation Sequence

### Phase M-A — Clean UI Direction

Goal:

Make the interface match the intended flow before deep automation.

Tasks:

1. Replace Marketing home SEO Loop launcher with Create Campaign Objective CTA.
2. Update Marketing module copy.
3. Add governance banner.
4. Update Approvals copy to explain two human gates.
5. Keep SEO Loop available only as an admin/diagnostic action if needed.

Acceptance:

- User sees campaigns as the start point.
- User no longer thinks SEO Loop is the main product.

### Phase M-B — Campaign Objective And Direction Gate

Goal:

Make campaign creation and first approval real.

Tasks:

1. Extend campaign data with objective/source/platform/CTA/stage fields.
2. Build campaign objective form.
3. Add direction approval state.
4. Add approve/reject/request-changes flow for campaign direction.
5. Save feedback memory from direction decisions.

Acceptance:

- A campaign can be created for GridFactory or Gulf-EL.
- Direction approval is required before execution.
- Rejection reason is saved.

### Phase M-C — Crina Orchestrator V1

Goal:

Crina can execute an approved campaign through internal agents.

Tasks:

1. Add campaign execution route.
2. Crina reads campaign + brand + relevant memory.
3. Crina extracts 7-day angles/calendar plan.
4. Crina decides which agents are required.
5. SEO Loop runs if blog/search is needed.
6. Content Agent creates platform-specific drafts.
7. Visual & Video Agent creates creative concepts.
8. Crina reviews each output.
9. Weak outputs loop up to max rounds.
10. Crina creates final campaign package.

Acceptance:

- Approved campaign moves through stages.
- Agent runs are logged.
- Pipeline shows current owner.
- Human is not asked during internal loops.

### Phase M-D — Pipeline Rebuild

Goal:

Pipeline becomes campaign execution tracking.

Tasks:

1. Show campaign cards, not all content ideas by default.
2. Add stage columns.
3. Show current owner.
4. Show fallback/provider/model status.
5. Add expandable details for internal agent tasks.
6. Add clear stuck/error states.

Acceptance:

- User can answer: "where is my campaign?"
- User can see: "Crina / SEO / Content / Visual / Publisher is working."

### Phase M-E — Final Package Approval

Goal:

One final approval before publishing prep.

Tasks:

1. Create final package view.
2. Add final approval queue section.
3. Approve moves to Publishing Agent prep.
4. Reject/request changes returns to Crina with reason.
5. Store decision in feedback memory.

Acceptance:

- User approves/rejects once at the final package level.
- Feedback becomes future memory.

### Phase M-F — Publishing Prep

Goal:

Publisher prepares drafts only.

Tasks:

1. Publishing Agent formats final package by platform.
2. Produces draft package and readiness checklist.
3. Marks package ready/scheduled draft.
4. No live API posting.

Acceptance:

- Final approved campaign becomes a publish-ready draft package.
- Nothing posts live.

### Phase M-G — Memory And Brain Integration

Goal:

The agents improve over time with saved feedback.

Tasks:

1. Brand-scope memory.
2. Campaign-scope memory.
3. Agent-scope memory.
4. Feed relevant memory into Crina prompts.
5. Feed specialist memory into sub-agent prompts.
6. Add memory inspection UI in Agent Brain or campaign detail.

Acceptance:

- Crina can use past feedback.
- GridFactory and Gulf-EL learning remain separate by default.

### Phase M-H — Capability Layer For Creative Agents

Goal:

Make Visual & Video real without hacks.

Tasks:

1. Add capability metadata:
   - text
   - image_generation
   - video_generation
2. Add provider/model capability selection.
3. Add GPT image generation adapter.
4. Add video generation placeholder as `COMING SOON` unless fully available.
5. Store generated asset metadata with final package.

Acceptance:

- Visual Agent can request image-capable models.
- Video is clearly partial until wired.

### Phase M-I — Website / SEO Site Integration

Goal:

Make SEO useful against real websites.

Tasks:

1. Add site connection model.
2. Connect sites to brands.
3. Read-first only:
   - sitemap,
   - pages,
   - metadata,
   - headings,
   - indexability,
   - GSC signals.
4. SEO Agent can suggest updates.
5. No destructive CMS writes by default.

Acceptance:

- SEO Agent can inspect brand websites safely.
- Suggestions go into campaign package or task list.

### Phase M-J — Observability / Live Brain

Goal:

Show what the agent system is actually doing.

Tasks:

1. Show campaign current owner.
2. Show active agent.
3. Show provider/model.
4. Show fallback/error status.
5. Show route/action source.
6. Show latest output summary.
7. Link to campaign and agent run logs.

Acceptance:

- User understands which robot is doing what.
- User sees which model is the agent's brain.

## 9. Acceptance Test For Operable Marketing Tab

GridFactory test:

1. Create GridFactory campaign objective.
2. Submit for direction approval.
3. Approve direction.
4. Crina starts campaign execution.
5. Pipeline shows campaign with current owner.
6. SEO/content/visual loops happen internally.
7. Crina creates final package.
8. Approvals shows final package.
9. Human approves.
10. Publishing Agent prepares draft package.
11. No live post happens.
12. Feedback and run data are visible.

Gulf-EL / NexRide test:

Repeat the same flow and confirm:

- Gulf-EL context is used,
- GridFactory context is not mixed in,
- mobility tone and CTAs are respected.

Fallback test:

1. Disable or break provider.
2. Run campaign execution.
3. UI shows `FALLBACK`.
4. Agent run logs show fallback.
5. Human final approval still required.

Rejection test:

1. Reject final package.
2. Provide reason.
3. Crina receives reason.
4. Feedback memory stores reason.
5. Campaign returns to rework.

## 10. Claude And Hermes Coordination

Claude role:

- reviewer,
- tester,
- copy/UX critic,
- spec reviewer,
- prompt reviewer.

Claude should not edit the same code areas Codex is editing:

- Marketing pages,
- campaign orchestration APIs,
- approvals APIs,
- pipeline UI,
- migrations for current Marketing work.

Hermes agent role:

- execute model calls,
- follow agent identity and brain context,
- return structured JSON,
- never own workflow state.

Codex role:

- own code implementation,
- own migrations,
- own commits,
- keep build/type/lint green.

## 11. Immediate Next Step After Review

Start Phase M-A.

First coding task:

Replace `/marketing` top-level SEO Loop launcher with a campaign command center
CTA:

```text
Create Campaign Objective
```

Then update copy so the operator understands:

- Campaigns start the work.
- Pipeline tracks execution.
- Approvals are only for human decisions.
- SEO Loop is an internal campaign subsystem.

No schema migration is required for this first UI framing step.
