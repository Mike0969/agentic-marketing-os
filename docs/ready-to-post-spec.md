# Ready to Post — spec + Codex task

Owner: Claude (review/spec) → Codex (implementation). Product rules: `marketing-plan.md` §2.
Review history + open issues: `docs/commit-reviews.md`.

## Goal (operator experience)

After a clean slate, the operator approves one campaign, automation runs hands-off, and a
single **"Ready to Post"** tab shows finished, channel-styled packages awaiting the human
final decision. There is **no social connection** — the end state is "ready to post"
(preview + export), not live posting. Per campaign the operator should be able to see:

- a **Blog** (title, meta, hero image, body)
- a **LinkedIn** post (text + image)
- an **X** post (≤280 chars + image)
- a **Facebook** post (text + image)
- an **Instagram carousel** (3–7 slide images + caption)
- an **Instagram video** (script + storyboard + cover frame; real video is `COMING SOON`)

Rejecting with a reason must make the agents do better next time (learning loop).

## Current state (verified)

Ready: campaign → automated chain → per-platform `content_items` → Crina review → human
gate; lease-locked/idempotent (commit 8c790ef); reject-with-reason already writes to
`feedback_memory` (`app/api/marketing/approvals/[contentItemId]/route.ts`).

Missing (this task):
1. **No image/video generation is wired** — `visual_asset_url` is never filled; only a text
   `visual_asset_prompt` exists. This is the main blocker.
2. **No "Ready to Post" tab** — campaign items at the human gate only appear in Pipeline as
   text; the `/marketing/approvals` page reads `content_queue` (SEO loop), not campaign items.
3. **Learning is half-wired** — reject reason is stored in `feedback_memory` but the campaign
   draft/visual agents never read it back (no `SELECT feedback_memory` in execute/orchestrate;
   only the older SEO loop reads it). So agents don't actually improve from rejections.

## Non-negotiables (must hold)

- No live publishing, no OAuth, no scheduling to networks. "Ready to post" = preview + export.
- Single brand per campaign; no cross-brand leakage in prompts or assets.
- Every model/image call logs to `agent_runs` with provider/model/fallback.
- Fallback/placeholder assets labeled `FALLBACK` / `DRAFT ASSET` / `COMING SOON`.
- Human final-approval gate stays required; nothing auto-approves.
- Keep build/type/lint green. Migrations idempotent; next number is **0017**.

---

## Codex task

Implement "Ready to Post" in this order (cheap+high-value first):

### 1. Feedback read-back (learning loop) — do first, no new deps
- In the campaign runners (`execute` seed + `orchestrate` draft/visual steps), before each
  model call, `SELECT` recent `feedback_memory` scoped by **brand_id + platform +
  content_type** (last ~5 approved and ~5 rejected, human-decided), and inject as
  "what humans approved / rejected and why" into the prompt — mirror the SEO loop pattern.
- On human reject/changes at the gate, ensure the reason lands on the item
  (`crina_review_notes`) so the immediate rework sees it, in addition to `feedback_memory`.
- Acceptance: reject an item with a specific reason → next generated version visibly
  addresses it; `feedback_memory` query appears in the agent run input.

### 2. Per-platform packaging → `ready_package`
- Add a "Publishing Agent" step (drafts only) that turns an approved-by-Crina item into a
  channel-ready package: trimmed text per platform (X ≤280, LinkedIn/FB/IG caption lengths),
  hashtags, mentions, alt text, suggested post time, asset checklist. Store as
  `content_items.ready_package jsonb` (migration 0017). No posting.

### 3. Image generation + storage + carousel assets (the bulk)
**Decision (settled):** primary = **GPT Image** (OpenAI's current image model — use
`gpt-image-1`, or the latest GPT Image id if newer, via the existing OpenAI integration),
with **automatic fallback to Flux / Stability** (free tier — via Replicate or Hugging Face
Inference) when GPT Image errors, hits quota, or is unconfigured. Same fallback philosophy as
the text providers; surface which one was used.
- Add an image provider adapter behind the provider/model registry, capability-gated
  (`image_generation`). Order: `gpt-image` → `flux` → `stability`. Log provider/model/fallback
  to `agent_runs` like the text runners.
- Wire the Visual & Video Agent: turn `visual_asset_prompt` into real image(s), upload to a
  **Supabase Storage** bucket, set `visual_asset_url`. On total failure (all providers) →
  keep status `placeholder` + `DRAFT ASSET` label (never block the pipeline).
- Carousel needs multiple images → add `content_assets` table (`id, content_item_id, kind,
  url, prompt, position, model, status, error`) OR a `ready_package.assets[]` array. One row
  per slide (3–7).
- Note: Flux/Stability also expose video endpoints — keep the adapter shaped so the same
  registry can later add a `video_generation` capability without a rewrite (see step 5).

### 4. "Ready to Post" tab (`/marketing/ready-to-post`)
- New Marketing tab listing campaign packages at `workflow_stage = human_final_approval`,
  grouped by campaign, rendered as **realistic channel previews**:
  - Blog: title/meta/hero/body. LinkedIn/X/Facebook: styled card with avatar, char-accurate
    text, image, hashtags. IG carousel: swipeable 3–7 slides + caption. IG video: cover +
    script/storyboard with `COMING SOON`.
  - Each card: **Approve**, **Request changes**, **Reject (reason required)** → reuse
    `approvals/[contentItemId]` (writes `feedback_memory`). End state shows **"Ready to post"**
    with an **Export/Copy** action (download images + copy text). No network posting.
- Pipeline stays status-only; this tab is the human decision + preview surface.

### 5. Instagram video — manual now, auto later (settled)
**Decision:** do NOT wire real video generation in this pass. For each IG video item produce:
- a **script**, **storyboard beats**, and **one generated cover frame** (via the step-3 image
  provider), labeled `DRAFT ASSET` / `COMING SOON`.
- In "Ready to Post", show these plus an **Export** action so the operator can copy the
  script/storyboard into an external video generator and produce the clip manually for now.
- Add a `video_generation` capability flag (unused/off) so a real provider can be slotted in
  later — candidates: Flux/Stability video, or Veo/Runway/Kling.

**Auto-enable trigger (document, don't build the automation yet):** once ~10 IG-video packages
have shipped whose script+storyboard+cover the operator rated good (i.e. approved without
"changes" on the video), revisit and turn on an automatic video model behind
`video_generation`. A simple approved-IG-video counter (from `feedback_memory` / approvals) is
enough to know when we've crossed ~10; no scheduled automation needed now.

### 6. Clean-slate reset (operational)
- Add a guarded admin action "Reset marketing data" that truncates `campaigns` +
  `content_items` (+ marketing `agent_runs`/`content_assets`) for a fresh demo. Confirm-gated,
  admin-only. (Avoid manual SQL.)

### Acceptance tests (demo flow)
1. Reset marketing data → 0 campaigns.
2. Create one GridFactory campaign → approve → automation runs hands-off to the human gate.
3. "Ready to Post" shows the 6 channel packages with real images (IG video = cover frame +
   script/storyboard + `COMING SOON` + Export); IG carousel shows 3–7 slides.
4. Image fallback: disable/break GPT Image → assets still generate via Flux/Stability, and the
   package shows which provider was used (logged to `agent_runs`). If all fail → `DRAFT ASSET`
   placeholder, pipeline not blocked.
5. Reject the LinkedIn post with a specific reason → automation reworks it → the new version
   addresses the reason (proves read-back).
6. No GridFactory/Gulf-EL cross-contamination in any package.
7. No network post occurs anywhere; human gate still required; `tsc`/`lint`/`build`/
   `check:supabase` green.

Update `docs/commit-reviews.md` outstanding issues as items close; keep `marketing-plan.md`
as the product spec.
