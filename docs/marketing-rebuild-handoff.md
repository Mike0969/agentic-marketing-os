# Marketing rebuild — handoff (Claude implements → Codex reviews/continues)

Role this round: **Claude implements, Codex reviews.** If Claude is out of context, **Codex continues
the "Next" list below.** Mike (human) is the operator. Coordinate via `docs/agent-bridge.md`.

## The model (what the operator wants — non-negotiable)
- **Crina proposes, the operator chooses.** Operator never fills campaign forms. Pick a brand →
  Crina proposes ideas → operator selects/archives. Start/end dates are **automatic** (no input).
- **Brand-level presets ("brand soul"):** audience, objective, platforms are defaults Crina reuses
  — the operator does **not** re-enter them each time. Operator can drop optional source material/notes.
- **Per-platform posts (CRITICAL):** a running campaign produces a **separate, tailored post for each
  platform** (LinkedIn ≠ X ≠ TikTok ≠ Instagram — different format, hook, maybe audience). Content +
  Visual agents work per platform. NOT one generic post reused.
- **No stages.** The operator never sees/uses workflow stages, never delegates tasks, never does steps.
  A running campaign just shows **"Working"** / **"On review."** It's autonomous agents in a loop.
- **One human gate:** Ready to Post. Approve → draft prepared (no live posting ever). Reject + remark →
  Crina routes to the right agent automatically (image complaint → Visual, text/hook → Content) →
  regenerate → back to gate. Remark saved to `feedback_memory` (learning).
- **Keep:** agents + `agent_config` + `feedback_memory` (memory). gpt-image-1 images. Crina Telegram
  ping. Supabase. **Delete:** the multi-stage workflow board + manual approve/move buttons.

## Done this round (Claude — uncommitted; Codex please review)
- **migration 0019** (APPLIED to Supabase): `campaigns.status` now allows `idea`/`archived`;
  added `idea_brief jsonb`, `selected_at`, `archived_at`.
- **`POST /api/marketing/campaigns/propose-ideas`** — Crina proposes N ideas for one brand, saved as
  `status='idea'` (nothing runs). `requireAgentAccess` (admin or token); middleware-excluded.
  Verified: produced 5 real GridFactory ideas via Hermes gpt-5.5 (not fallback).
- **`POST /api/marketing/campaigns/[id]/decision`** — `{action:"select"|"archive"}`. select →
  `status='active'`+`selected_at`; archive → `status='archived'`+`archived_at`.
- **`components/os/ideas-board.tsx`** (new) + **`app/(shell)/marketing/campaigns/page.tsx`** rewritten:
  brand picker + optional notes + "Propose ideas" → expandable idea cards (title/hook + angle/summary/
  rationale/audience/CTA/platforms) → **Select to run / Archive**; "Working now" strip; archive toggle.
- Deleted unused `components/os/campaign-workspace.tsx` (backup: `data/archives/old-ui/`).
- `lib/types.ts`: `CampaignStatus` += `idea`/`archived`; `Campaign` += `idea_brief`/`selected_at`/`archived_at`.
- Earlier fixes this session: `lib/data.ts` empty-campaigns fallback bug (was hiding brands when 0
  campaigns); `agent_config` visual brain `gpt-image-1`→`glm/glm-5.2` (image model stays gpt-image-1 via
  backend env); HF image endpoint → `router.huggingface.co`; `OPENAI_IMAGE_QUALITY` default `low`.
- tsc clean.

## Next (priority order — Codex continue here)
1. **Select → run, no-stages per-platform execution.** On select (`status='active'`), Crina expands the
   idea into **one content_item per platform**, each tailored (format/hook/audience), then Visual makes a
   per-platform image (gpt-image-1). Collapse the old `orchestrate` stage machine — no `workflow_stage`
   churn. End state = items at "ready_to_post". Running campaign shows "Working"/"On review" only.
2. **Pipeline = read-only monitor.** Rewrite `pipeline-workspace.tsx`: list running campaigns + current
   agent + error flag. Remove stage columns, all buttons, auto-tick controls.
3. **Ready-to-Post reject→reroute loop.** Reject + remark → Crina picks the agent (image→Visual,
   text→Content) → regenerate → back to gate. Save remark to `feedback_memory`.
4. **Brand presets UI ("brand soul").** Editable defaults: audience, objective, **default_platforms**
   (add column). Crina uses them in propose-ideas.
5. **Supabase/state cleanup.** Retire `workflow_stage` churn; simplify content_item states to
   `working → ready_to_post → approved/draft / reworking`. Migration **0020+**.
6. **Re-enable the autonomous engine** (cron loop) only AFTER per-platform execution exists. Currently
   STOPPED on purpose (nothing auto-runs).

## Infra state right now
- ONE dev server on **http://localhost:3000** (clean `.next`). Autonomous cron loop **STOPPED**.
- Telegram wired (existing Hermes bot `@Carmakerresearchbot`, chat `1678…`), send-only, verified.
- Image: gpt-image-1 real (verified). 5 GridFactory ideas in DB (`status='idea'`).
- Uncommitted Trading/Founder/Agents WIP still in tree — leave it alone; stage only marketing files when committing.
- Constraints: no live posting; single brand/campaign; per-platform tailored; keep tsc/lint/build/check:supabase green.

## Full target flow (operator's complete vision — canonical)

All campaign **setup** happens on the **Campaigns** page (one page):
1. **Crina proposes ideas** per brand (DONE). Operator can edit fields, tap preset platforms,
   add their own view/notes, and **Refine** (send back to Crina with remarks) — DONE.
2. **Competitor Intelligence agent** [TO BUILD]: periodically scrapes social media for viral posts
   from similar projects — best hooks, best market approaches — into a "database" Crina draws
   inspiration from. The operator can **see this agent's work on the Campaigns page** (inspires them too).
3. **Calendar / posting schedule** [TO BUILD], set BEFORE final approval, on the Campaigns page:
   period (e.g. a month), daily cadence, posts/day, which platforms, and **posting hour by audience
   timezone** (don't post during night in EU / US / Asia).

When the operator **accepts the setup**, agents work autonomously (no stages, no manual steps):
4. **SEO agent** → website + blog work.
5. **Content Creator** → text content, in a Crina approve-loop.
6. **Visual agent** → prompts for image / video / carousel, in a Crina verify-loop.
7. Output is **per-platform** posts, e.g. one campaign = Instagram (1 video, 2 carousel, 1 text+image)
   + LinkedIn (4 posts with images) — **each with date + hour**.

8. **Approval tab** [TO REBUILD]: operator sees the campaign's posts (with date/hour). Approval is
   **visual-first**: operator says "video ok" / "image ok". **Text + hashtags are predefined** (don't
   make the operator rewrite text) — operator may leave a **small observation note**. Then it starts.
   Reject + remark → Crina routes to the right agent (visual vs content) → regenerate → back to gate.
9. Campaign runs (drafts only — no live posting). Operator can adjust later if something's wrong.
10. **Analytics agent** + Crina loop → campaign performance **report in the Analytics tab** [TO BUILD].

### Recommended build order (Claude)
A. **Per-platform execution** — make "Run" real: Crina + Content + Visual create tailored posts per
   platform (with gpt-image-1 images) → land in Approval tab. (Highest value — makes agents real.)
B. **Approval tab rebuild** — per-campaign posts, date/hour, visual-first approve, predefined text +
   observation note, reject→reroute.
C. **Calendar/scheduling** on Campaigns (period, cadence, posts/day, platform, hour-by-timezone).
D. **Competitor Intelligence agent** — scrape → DB → Crina inspiration + operator-visible feed.
E. **Analytics agent** — post-run report in Analytics tab.

### Known fixes applied
- Platforms are now preset tap-to-choose chips (no free text). Edit saves via decision action=update
  (verified DB persists). Stray "active" campaigns reverted to ideas (no fake "Working").

## Session update (Claude) — setup layer progress
DONE: Ideas board + edit/refine (Crina via Hermes, real); **preset platform chips** (tap-to-choose);
**Calendar/schedule** in the idea edit (`idea_brief.schedule` = {start,end,posts_per_day,timezone,
from_hour,to_hour}; saved + shown). Decision routes: select/archive/update; refine route.
DECISION: **Competitor Intelligence = deferred** (operator chose paid social scraper LATER; do not
build a half version now).

### NEXT = per-platform execution (the keystone — makes "Run" real). Spec:
- New route `POST /api/marketing/campaigns/[id]/run` (or reuse decision select to also trigger it):
  for each platform in `idea_brief.platforms`, generate a **tailored** post:
  - Content (Crina/Content agent) → platform-specific text/hook/caption/hashtags.
  - Visual agent → image via `generateMarketingImage` (gpt-image-1). For Instagram: 1 video stub +
    2 carousel + 1 image (per operator's example mix); LinkedIn: N image posts. Each carries
    date+hour from `idea_brief.schedule`.
  - Insert one `content_item` per post with `platform`, text, image url(s), `status` ready-for-approval.
  - NO `workflow_stage` churn, no stage board. Campaign just shows "Working" then "On review".
- Then rebuild **Approval tab**: per-campaign posts with date/hour; **visual-first approve** ("image/video
  ok"); text+hashtags predefined (operator may add a short observation); reject+remark → Crina reroutes
  to Visual or Content → regenerate → back. No live posting.
- Then **Analytics agent** report. Competitor + paid scraper later.
- Keep tsc/lint/build/check:supabase green. Image quality `low`. Single brand per campaign.

### Infra: ONE dev server :3000; cron loop STOPPED; Telegram (Hermes bot) wired; 6 ideas in DB.

## Session update 2 — execution engine PROVEN + gaps
DONE & VERIFIED LIVE: `POST /api/marketing/campaigns/[id]/run` (token/admin) generates **per-platform
posts** with the **Content → Crina-review loop** (observed 2-3 rounds) + **gpt-image-1 image each**,
lands them at `human_final_approval` (shows in Ready to Post). Reads `feedback_memory` into prompts.
Telegram Crina ping now fires at end of run (and via cron). Ready-to-Post reject/approve now removes
the item from the list instantly. Wired Ideas board "Run" → this route.

KNOWN GAPS (build next, in order):
1. **Run is synchronous → ~3 min, can time out.** Make it **incremental/background**: create per-platform
   "post slots" fast, then a worker (re-enable the cron, simplified, no stages) generates ONE post per
   tick (Content→Crina loop→Visual), pings when each campaign's set is ready. Run button returns immediately.
2. **Reject → auto-regenerate (the core loop, MISSING).** New route e.g. `POST /api/marketing/content-items/[id]/rework`
   {remark}: Crina classifies the remark (image complaint → Visual regen; text/hook → Content regen, with
   Crina review loop); save remark to `feedback_memory`; produce a NEW version; set back to
   `human_final_approval` + `notified_at=null` so it **reappears in Ready to Post and re-pings**. Wire the
   Ready-to-Post reject button to call this (replacing the current approvals call), so a better version
   actually returns. Make it background like #1 (don't block the button).
3. Approval UX polish (operator's spec): visual-first approve ("image/video ok"), text+hashtags predefined,
   small observation note. Per-platform mix (IG: 1 video-stub/2 carousel/1 image).
4. Then: Calendar distribution into real per-post date/hour; Analytics agent report; Competitor (paid) later.

Engine building blocks all verified individually: Crina/Content via Hermes, gpt-image-1, content_items
insert, feedback_memory read-back, Telegram send. Files: `app/api/marketing/campaigns/[id]/run/route.ts`,
`components/os/ideas-board.tsx`, `components/os/ready-to-post-workspace.tsx`. Keep checks green.

## Session update 3 — reject->regenerate loop DONE (verified live)
`POST /api/marketing/content-items/[id]/rework` {remark}: classifies remark (visual vs content),
regenerates via Visual (gpt-image-1) or Content (Crina-aware), saves remark to feedback_memory, re-queues
at human_final_approval + notified_at=null (reappears + re-pings). Ready-to-Post reject button wired to it
(updates in place; approve still finalizes+removes). Verified: Blog text rework routed to Content, content
changed, re-pinged. Synchronous ~20-40s/post (acceptable for one post; full-Run incrementalization still
the other open item). tsc clean.
