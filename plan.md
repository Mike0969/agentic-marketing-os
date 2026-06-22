# Agentic Marketing OS Campaign Orchestration Plan

Status: implementation roadmap for Codex, Claude, and Hermes agents.

This plan translates `docs/marketing-campaign-orchestration-spec.md` into coding
steps. The product goal is a campaign-centric Marketing OS:

```text
Campaign objective/source
  -> Crina orchestrates agents
  -> SEO/content/visual/publisher loops run internally
  -> Crina assembles final campaign package
  -> Human approves once before publishing prep
  -> Publishing Agent prepares drafts only
  -> feedback and analytics improve future runs
```

No live posting. No autonomous publishing. Human approval remains mandatory.

## Current Reality

Done:

- Campaign-centric product spec exists:
  `docs/marketing-campaign-orchestration-spec.md`.
- SEO Loop works technically as a standalone subsystem.
- `feedback_memory` and `content_queue` exist in Supabase.
- SEO Loop can draft, Crina-review, send to human approval, and record memory.

Not done yet:

- Marketing UI still does not fully reflect the campaign-centric model.
- `/marketing` still exposes SEO Loop as a visible top-level action.
- Campaigns are not yet the main operator workflow.
- Pipeline does not yet show campaign execution ownership clearly.
- Approvals do not yet represent the two intended gates:
  campaign direction and final pre-publish package.
- Crina does not yet orchestrate the full campaign chain automatically.

When Codex said "Step 1 done", it meant the canonical spec was written and
committed. It did not mean the OS UI was changed yet.

## Step 1 — Lock The Product Direction

Status: DONE.

Commit:

```text
bb0e428 Document campaign-centric marketing orchestration
```

What was done:

- Created the campaign-centric Marketing OS spec.
- Defined agent roles.
- Defined human gates vs machine loops.
- Defined brand scoping rules for GridFactory and Gulf-EL / NexRide.
- Defined where SEO Loop belongs as an internal subsystem.

No UI or API behavior was changed in this step.

## Step 2 — Reframe Marketing Home

Goal:

Make `/marketing` feel like a campaign command center, not a toolbox.

Implementation:

- Remove or de-emphasize the top-level `Run SEO Loop` launcher.
- Add primary action: `Create Campaign Objective`.
- Show campaign-level status blocks:
  - Draft objectives
  - Awaiting campaign direction approval
  - In execution with Crina
  - Awaiting final approval
  - Ready for publishing prep
- Show recent Crina decisions and recent agent runs.
- Keep existing module cards, but update language:
  - Campaigns = source of truth
  - Pipeline = where campaign work is now
  - Approvals = human decision desk

Acceptance:

- A non-technical operator understands that campaigns start from objectives.
- SEO Loop is no longer presented as the main workflow.

## Step 3 — Campaign Objective Model

Goal:

Add a campaign objective layer that gives Crina a clear source of truth.

Minimum data needed:

- campaign id
- brand id
- objective
- source material or notes
- target audience
- platforms
- offer / CTA
- desired week or deadline
- status
- human direction approval state
- final package approval state
- current stage
- current owner
- cross-brand enabled flag, default false

Preferred statuses:

```text
draft_objective
awaiting_direction_approval
approved_for_execution
in_execution
assembling_final_package
awaiting_final_approval
approved_for_publishing_prep
publishing_prep
ready_scheduled_draft
rejected
needs_rework
completed
```

Acceptance:

- GridFactory and Gulf-EL campaigns remain distinct by `brand_id`.
- Cross-brand work is impossible unless explicitly enabled.
- Campaigns can be approved for execution before agents run.

## Step 4 — Campaign Direction Approval Gate

Goal:

Approvals should show campaign objectives that need human permission before
Crina starts internal execution.

Implementation:

- Add approval type: `campaign_direction`.
- Human can:
  - approve direction
  - reject objective
  - request changes with reason
- Approval moves campaign to `approved_for_execution`.
- Rejection/request-changes saves feedback memory for Crina.

Acceptance:

- Human approves the campaign once at the beginning.
- Internal agent work does not begin before direction approval.

## Step 5 — Crina Campaign Orchestrator

Goal:

Crina becomes the actual campaign operator.

Execution chain:

```text
Crina reads approved campaign
  -> extracts angles
  -> decides required agents
  -> runs SEO Loop if blog/search needed
  -> runs Content Creator for platform drafts
  -> runs Visual & Video for creative concepts/assets
  -> reviews each output
  -> sends weak work back up to max rounds
  -> assembles final campaign package
```

Rules:

- Every model call logs to `agent_runs`.
- Every internal loop records stage and owner.
- Fallback output is labeled `FALLBACK`.
- Crina can escalate to human only if blocked or after max failed rounds.
- No live publishing.

Acceptance:

- Human does not approve SEO/content/visual intermediate steps.
- Pipeline shows where the campaign is while agents work.
- Crina creates one final package for human approval.

## Step 6 — Embed SEO Loop As Internal Subsystem

Goal:

Keep the working SEO Loop but move it under campaign execution.

Implementation:

- SEO Loop should accept a `campaign_id`.
- SEO Loop should read campaign brand context.
- SEO Loop output becomes part of the campaign package.
- SEO Loop diagnostics can be viewed from campaign detail or Agent Brain.
- SEO Loop should not be the main button on `/marketing`.

Acceptance:

- SEO Loop can still be tested by admins.
- Normal operator flow goes through campaigns, not direct SEO tools.

## Step 7 — Pipeline As Campaign Work Tracker

Goal:

Pipeline answers: "Where is my campaign now?"

Recommended stages:

```text
Campaign approved
With SEO Agent
With Content Creator
With Visual & Video Agent
With Crina Review
Final Package Assembly
Waiting Final Approval
Publishing Prep
Ready / Scheduled Draft
Needs Rework
```

Implementation:

- Show campaign/package-level cards first.
- Show current owner:
  - Crina
  - SEO Agent
  - Content Creator
  - Visual & Video Agent
  - Publishing Agent
  - Human
- Allow expanding a campaign to see internal outputs and loop history.

Acceptance:

- Operator does not scroll through dozens of isolated idea cards.
- Operator can immediately see which agent owns a campaign now.

## Step 8 — Final Campaign Package Approval Gate

Goal:

Approvals should show only the final package when Crina is done.

Final package should include:

- campaign summary
- selected angles
- platform-specific copy
- blog/SEO draft if applicable
- visual concepts or generated assets
- CTA
- suggested schedule
- risk/approval notes
- fallback/provider/model notes

Human actions:

- approve
- reject
- request changes with reason

Acceptance:

- One final human approval happens before publishing prep.
- Rejection reason updates feedback memory.
- Crina uses feedback on the next revision.

## Step 9 — Publishing Prep Only

Goal:

Publisher prepares platform-ready drafts after final approval.

Implementation:

- Publishing Agent formats content per platform.
- It prepares captions, hashtags, asset checklist, and suggested times.
- It marks package as draft-ready.

Blocked:

- No OAuth posting.
- No direct scheduling.
- No live post.

Acceptance:

- Approved campaign becomes a draft package only.
- Any future live posting requires a separate explicit gate.

## Step 10 — Memory And Brain Feedback

Goal:

Make agents improve through saved memory, not magic.

Implementation:

- Store human rejections, approvals, and requested changes.
- Scope memory by:
  - brand
  - campaign
  - agent
  - content type
- Feed relevant memory back into Crina and specialist prompts.
- Summarize useful memory, do not store large raw transcripts as prompt context.

Acceptance:

- GridFactory feedback does not pollute Gulf-EL unless cross-brand is enabled.
- Crina can cite past human preferences in future campaign decisions.

## Step 11 — Observability / Brain View

Goal:

Show what the robots are doing and which brain/model they use.

Show:

- campaign current owner
- active agent
- provider
- model
- fallback status
- latest output summary
- route/source that triggered the run
- token/latency where available

Acceptance:

- Operator can see whether Crina, SEO, Content, Visual, or Publisher is working.
- Operator can see if output was real model output or fallback.

## Step 12 — Future Capability Layer

Goal:

Support model capabilities cleanly.

Capabilities:

- text
- image_generation
- video_generation

Rules:

- Content and SEO agents usually need text.
- Visual & Video Agent may need image/video capable models.
- Video generation can be marked `COMING SOON` until fully wired.
- Provider keys stay server-side.

Acceptance:

- Agent model selection can consider capability, not only provider/model name.

## Claude Coordination Rules

Claude should help as reviewer/tester/spec writer unless explicitly assigned a
separate file area.

Claude can safely do:

- review UI behavior,
- write acceptance tests,
- review copy labels,
- inspect whether workflow matches this plan,
- suggest prompt improvements.

Claude should not edit at the same time as Codex in:

- `/marketing`
- campaign orchestration APIs
- approvals APIs
- pipeline UI
- migrations for the same feature

If Claude must code, assign it a separate doc/spec/test file and commit
separately.

## Immediate Next Coding Step

Step 2 is next:

Reframe `/marketing` from SEO Loop launcher to campaign command center.

Specific first change:

- remove/de-emphasize top-level `Run SEO Loop`,
- add `Create Campaign Objective`,
- update module language so the operator understands:
  - Campaigns start the work,
  - Pipeline tracks execution,
  - Approvals are only human decision points,
  - SEO Loop is internal.
