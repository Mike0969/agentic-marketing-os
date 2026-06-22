# Marketing Campaign Orchestration Spec

Status: canonical product direction for Marketing OS.

This spec replaces the old operator-facing flow where the human runs individual
agent tools such as SEO Loop directly. The operator should approve a campaign
direction, then Crina should orchestrate the agents, machine review loops, final
package assembly, and publishing preparation.

## 1. Operating Model

The Marketing OS should behave like a campaign command center, not a collection
of isolated agent buttons.

Canonical flow:

```text
Campaign source/objective
  -> Crina extracts angles and campaign plan
  -> SEO, content, visual/video, and publisher agents work internally
  -> Crina reviews and loops weak work back to the responsible agent
  -> Crina assembles one final campaign package
  -> Human gives one final pre-publish approval
  -> Publishing Agent prepares drafts only
  -> Analytics and human feedback update memory for the next campaign
```

The 7-day content automation pattern from the reference workflow maps into the
OS like this:

```text
One source or objective
  -> content angles
  -> platform-specific posts
  -> visual concepts
  -> 7-day calendar
  -> final human review
  -> scheduling/publishing prep
  -> weekly performance review
  -> memory improvement
```

No live posting happens in this spec. Publishing means draft packaging until a
future explicit live-posting integration and safety gate exist.

## 2. Human Gates vs Machine Loops

Normal human gates:

1. Campaign direction gate
   - Human approves the objective, brand, target audience, platforms, offer/CTA,
     timing, and constraints.
   - This is permission for Crina to execute internally.

2. Final pre-publish gate
   - Human reviews the final campaign package assembled by Crina.
   - Human can approve, reject, or request changes with reasons.
   - Approval moves the campaign to Publishing Agent draft preparation, not live
     posting.

Machine-only gates:

- SEO Agent output reviewed by Crina.
- Content Creator output reviewed by Crina.
- Visual & Video output reviewed by Crina.
- Publisher draft package checked by Crina before final readiness.

The human should not approve every internal agent step. Pipeline should expose
where the work is, but Approvals should show only items that need a human.

## 3. Agent Roles

### Crina: Marketing CEO Agent

Crina owns campaign strategy and orchestration.

Responsibilities:

- Interpret the approved campaign objective.
- Select the needed sub-agents.
- Pass scoped brand, campaign, and memory context to each sub-agent.
- Judge sub-agent outputs against campaign goals and brand rules.
- Send weak work back with specific reasons.
- Assemble the final campaign package.
- Escalate to the human only at the two human gates or when blocked.

Blocked actions:

- No live publishing.
- No cross-brand mixing unless explicitly configured.
- No unverified claims.

### SEO Agent

The SEO Agent is an internal campaign execution agent.

Responsibilities:

- Search intent framing.
- Keyword themes.
- Blog/article brief.
- Metadata suggestions.
- Content gap and site/content recommendations.
- SEO Loop builder behavior for blog content quality.

The SEO Agent does not request human approval directly. Its output returns to
Crina.

### Content Creator Agent

The Content Creator turns campaign strategy into platform-specific writing.

Responsibilities:

- LinkedIn posts.
- X posts or threads.
- Instagram/TikTok/YouTube caption drafts where applicable.
- Blog/article draft expansion.
- Hook, body, CTA, and tone variants.
- Claims-to-review list.

The Content Creator receives SEO, competitor, brand voice, and campaign context.
Weak work returns to the Content Creator through Crina, not through direct human
intervention.

### Visual & Video Agent

The Visual & Video Agent creates creative direction and future asset requests.

Responsibilities:

- Carousel concepts.
- Image prompts.
- Short video scripts.
- Storyboard beats.
- Visual format recommendations per platform.
- Brand-consistent creative rules.

Actual image or video generation should use future provider capability metadata
such as `image_generation` and `video_generation`. Until fully wired, visual
outputs are creative briefs or clearly labeled generated assets.

### Publishing Agent

The Publishing Agent prepares platform-ready draft packages only.

Responsibilities:

- Format final approved copy for each platform.
- Prepare draft captions, hashtags, asset checklist, and suggested schedule.
- Package content for future scheduler tools.

Blocked actions:

- No live posting.
- No OAuth posting action.
- No scheduling without explicit final approval.

## 4. Brand and Project Scoping

GridFactory.io and Gulf-EL.com / NexRide must remain distinct by default.

Rules:

- Every campaign has exactly one primary `brand_id`.
- Agent prompts receive only the primary brand context by default.
- Brand context includes positioning, target audience, tone, pillars, SEO
  targets, CTAs, approval rules, and relevant memory.
- Feedback memory should be filtered by brand whenever possible.
- Cross-brand content is disabled unless the campaign has an explicit
  cross-brand setting.
- If cross-brand is enabled, Crina must explain:
  - why both brands are involved,
  - which audience belongs to each brand,
  - which outputs belong to each brand,
  - which claims need separate review.

This prevents mobility language from leaking into GridFactory infrastructure
campaigns and prevents investor-grid language from leaking into NexRide mobility
campaigns.

## 5. Agentic OS Context

The OS architecture remains:

- Next.js routes orchestrate workflows.
- Hermes or another configured provider executes model calls.
- Supabase persists campaign state, content state, feedback, and observability.
- `agent_config` controls provider/model choices per agent.
- `agent_runs` records every model call.
- Shared brain and per-agent memory provide reusable context.

Hermes does not become the workflow database. It is one execution engine. The
Marketing OS owns sequencing, state, gates, and memory.

Model/brain principles:

- Crina can use a stronger reasoning model.
- SEO and research can use cost-efficient models where quality is acceptable.
- Visual/video should use capability-aware models once `image_generation` and
  `video_generation` are wired.
- Per-agent memory should contain only useful summaries, not large transcripts.
- Human approval/rejection reasons become future prompt context.

## 6. SEO Loop Placement

Current SEO Loop behavior is useful but should become internal.

Current behavior:

```text
Human runs SEO Loop
  -> SEO drafts
  -> Crina reviews
  -> Human approves SEO output
```

Correct behavior:

```text
Approved campaign
  -> Crina decides SEO Loop is needed
  -> SEO drafts
  -> Crina reviews and loops up to max rounds
  -> SEO output becomes one component of final campaign package
  -> Human sees it only inside the final package
```

SEO Loop should remain visible for diagnostics, but not as the primary Marketing
home CTA. Good placements:

- campaign detail execution trace,
- Agent Brain / observability,
- optional technical admin tool.

## 7. Page Behavior Direction

### `/marketing`

Purpose: campaign command center.

Should show:

- active campaigns,
- campaigns awaiting final approval,
- campaigns in execution,
- recent Crina decisions,
- recent agent runs,
- main action: create campaign objective.

Should not lead with a direct SEO Loop button.

### `/marketing/campaigns`

Purpose: campaign source of truth.

Should show:

- draft campaign objectives,
- approved campaigns,
- active executions,
- final packages,
- completed or scheduled draft packages,
- rejected/rework campaigns.

Campaign cards should expose brand, objective, current stage, current owner,
package readiness, and final approval status.

### `/marketing/pipeline`

Purpose: answer "where is my campaign now?"

Pipeline should be campaign/package-level first, with expandable details.

Suggested stages:

- Campaign approved
- With SEO Agent
- With Content Creator
- With Visual & Video Agent
- With Crina review
- Final package assembly
- Waiting final approval
- Publishing prep
- Ready/scheduled draft

Do not flood the board with every idea unless the operator expands a campaign.

### `/marketing/approvals`

Purpose: human decision desk.

Should show only:

- campaign direction approvals,
- final pre-publish approvals,
- rework requests needing human clarification.

It should not show internal SEO/content/visual machine review steps unless Crina
escalates them.

## 8. Suggested Data Model Direction

Future campaign orchestration should add or reuse tables around these concepts:

- campaign objectives and source material,
- campaign execution runs,
- campaign agent tasks,
- campaign final packages,
- feedback memory scoped by brand/campaign,
- agent run observability.

The existing `seo_loop`, `content_queue`, and `feedback_memory` work should be
embedded as campaign execution internals rather than treated as the top-level
operator workflow.

## 9. Acceptance Criteria

A correct v1 campaign orchestration implementation should pass this test:

1. Human creates a GridFactory campaign objective.
2. Human approves the campaign direction once.
3. Crina runs the needed sub-agents internally.
4. SEO/content/visual loops happen without asking the human.
5. Pipeline clearly shows which agent or stage owns the campaign.
6. Crina assembles a final package.
7. Human approves or rejects the final package once.
8. Publishing Agent prepares platform-ready drafts only.
9. Human feedback is saved to memory and appears in future Crina context.
10. No Gulf-EL context appears unless cross-brand is explicitly enabled.

The same test must pass independently for Gulf-EL.com / NexRide.
