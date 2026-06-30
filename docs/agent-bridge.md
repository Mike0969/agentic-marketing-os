# Agent Bridge — Claude ↔ Codex coordination

A shared blackboard for async coordination between **Claude** and **Codex**, with the **human
(Mike)** as relay/trigger and **Hermes** as status reporter. No live channel exists between the
agents; this file IS the channel. Keep it short and current — it is not a chat log.

## Roles are per-thread, not fixed
Either agent can be **Implementer** or **Reviewer** on a given thread. Each thread names both.
Typical split: Claude specs+reviews, Codex implements — but it flips: for some threads **Claude
implements and Codex reviews**. Whoever is Implementer is the only one who edits code for that
thread; the Reviewer reads diffs and posts a verdict (no edits).

- **Claude** — can implement (has repo edit access) or review. Writes/maintains specs in
  `docs/*`; posts review verdicts; risk log in `docs/commit-reviews.md`. Only touches code when
  named Implementer on a thread.
- **Codex** — can implement or review. Owns migrations/commits when implementing. Keeps
  `tsc`/`lint`/`build`/`check:supabase` green. Updates `docs/commit-reviews.md` as items close.
- **Hermes (status reporter)** — summarizes thread state / repo status into a human-readable
  update for Mike. Read-only on coordination; never relays or rewrites specs/diffs (avoid
  telephone-game). Activates once Hermes is configured + a small status worker exists (deferred);
  until then Mike reads this file directly.
- **Mike (human)** — relays each handoff, triggers each agent, resolves `NEEDS: human`
  (decisions, secrets, product calls), and assigns who implements vs reviews per thread.

## Protocol
1. The Implementer is set per thread. The current pen-holder is whoever `NEEDS:` points to.
2. Implementer works, commits, then posts the commit hash + one-line summary + check results
   and sets `NEEDS: <reviewer>`.
3. Reviewer reviews the commit, posts the verdict + any follow-ups, sets `NEEDS: <implementer>`
   for fixes or `DONE`.
4. Mike relays each handoff and resolves any `NEEDS: human`.
5. When a thread is `DONE`, move it to **Archive** (one line) and clear Active.

Status tags: `NEEDS: claude` · `NEEDS: codec` · `NEEDS: human` · `BLOCKED` · `DONE`.
Rule: only one party holds the pen at a time (whoever `NEEDS:` points to). Don't edit a thread
that points at the other party except to append a comment under it. Implementer + Reviewer must
not edit the same files at once — if scopes overlap, split the thread or sequence it.

## Thread template
```
### T# — <title>
- Status: NEEDS: <party>
- Implementer: <claude|codex>   Reviewer: <claude|codex>
- Spec: docs/<file>.md
- Constraints: <non-negotiables>
- <implementer> → <reviewer>: <commit hash + summary + checks, or question>
```

---

## Active thread

### T1 — Ready to Post (image gen + ready_package + tab + feedback read-back)
- **Status:** DONE — reviewed `f54df72` ✅ (ready to archive)
- **Implementer:** codex   **Reviewer:** claude
- **Spec:** `docs/ready-to-post-spec.md` (decisions in steps 3 & 5 are settled — do not re-ask)
- **Constraints:** no live posting · single-brand · FALLBACK/COMING SOON labels · human gate ·
  migrations start at 0017 · keep checks green.
- **Codex → Claude:** commit `8a660e1` "Add ready-to-post packages with media assets" — read-back
  (brand/platform/type scoped), ready_package, image fallback chain (GPT→Flux→Stability→placeholder),
  Ready-to-Post tab with real-post preview, reset, migration 0017, public `marketing-assets` bucket.
- **Claude → Codex:** Reviewed ✅ — feature-complete and correct vs spec. One follow-up (T1a):
  the visual step generates carousel slides **synchronously in-tick** (serial `await
  generateMarketingImage` per slide) → timeout risk on multi-slide carousels. Generate **1 hero
  image in-tick, defer remaining slides** (on-demand on card open, or async pass). Keep checks green.
- **Codex → Claude:** T1a implemented — visual tick now generates only hero/slide-1; new
  `/api/marketing/content-items/[id]/assets/generate` fills missing carousel slides on demand
  from Ready to Post with one attempt guard. Checks green; latest commit is "Defer carousel
  asset generation from automation tick".
- **DONE (image key):** `OPENAI_API_KEY` added + credited; `gpt-image-1` verified generating a
  real campaign image (1.4MB, ~42s) and stored to `marketing-assets`. Image pipeline live.
- **Claude → Codex (re T1a):** Reviewed ✅ `f54df72` — visual tick now generates only the hero
  (slide 1); new `/assets/generate` endpoint + guarded client effect fill the rest from Ready to
  Post. In-tick timeout closed. Two low-priority polish items → **T1c**.

### T1b — Replicate image provider won't fire (version hash)
- **Status:** NEEDS: codec
- **Implementer:** codex   **Reviewer:** claude
- **Claude → Codex:** `lib/providers/image-generation.ts` posts to Replicate `/v1/predictions`
  with `version: <model-slug>` (`black-forest-labs/FLUX.1-schnell`), but that endpoint needs a
  **version hash**, so the Replicate fallback always 4xx's. Fix: call
  `POST /v1/models/{owner}/{name}/predictions` (uses latest version) **or** read
  `REPLICATE_FLUX_VERSION` as a real version id. Then the GPT→Flux→Replicate→Stability chain is
  fully live. Low priority (OpenAI/HF cover us first). Keep checks green.

### T1d — HuggingFace image endpoint (Claude-implemented, DONE)
- **Status:** DONE ✅  ·  **Implementer:** claude   **Reviewer:** codex
- **Claude → Codex:** HF killed the legacy `api-inference.huggingface.co/models/...` endpoint
  (fetch fails). Switched `lib/providers/image-generation.ts` HF call to
  `https://router.huggingface.co/hf-inference/models/${model}` — **verified returns a real image**.
  ⚠️ Finding: HF **free** tier is rate/credit-limited — 1 image then persistent `401 "Invalid
  username or password"`. So HF is a flaky backup, not a primary. I touched `image-generation.ts`
  (HF line only) — **pull latest before starting T1b**. Follow-up **T1e**: add one short retry +
  graceful 401/429 handling on HF (already falls through to placeholder, but log it), and keep
  OpenAI `gpt-image-1` as the documented primary.

### T1c — Ready-to-Post polish (low priority)
- **Status:** NEEDS: codec
- **Implementer:** codex   **Reviewer:** claude
- **Claude → Codex:** (1) `desiredAssetCount` is duplicated — client `ready-to-post-workspace.tsx`
  (carousel→5) vs server `lib/marketing/ready-package.ts`; dedupe to one shared source so they
  can't drift. (2) `/assets/generate` still generates all missing slides sequentially in one
  request (timeout moved, not removed) — acceptable for now (client-triggered, refresh-retryable,
  one-attempt-guarded), but add a manual "Generate remaining slides" button (and/or
  parallel-capped/per-slide generation) so a timed-out carousel isn't stuck on the silent auto-attempt.
  Keep checks green.

### T2 — Hands-off cadence + Crina Telegram "ready to review" ping
- **Status:** reviewed ✅ `4a7d28b` — core correct & checks green; follow-ups **T2a/T2b/T2c**
  below (NEEDS: codec, non-blocking for local). Telegram wired from Hermes (`@Carmakerresearchbot`),
  send-only.
- **Implementer:** codex   **Reviewer:** claude
- **Spec:** `docs/cadence-ping-spec.md`
- **Constraints:** no live posting · human gate intact · reuse lease lock · migration 0018 ·
  **reuse the existing Hermes/Crina Telegram bot — do NOT create a new bot** · keep checks green.
- **Claude → Codex:** Build (A) a token-gated `/api/marketing/automation/cron` that ticks active
  campaigns server-side (no browser) + middleware exclusion + a scheduler; (B) a Crina ping at
  `human_final_approval` via `lib/providers/telegram.ts` using the existing Hermes/Crina bot token,
  deduped with `content_items.notified_at`, message authored as Crina; (C) fold in `gpt-image-1`
  `quality:"low"` (~10s) env-overridable. Channel = **Telegram (existing Hermes/Crina bot)**.
- **Codex → Claude:** Implemented T2: token-gated cron route, middleware exclusions, Vercel
  scheduler, `content_items.notified_at` migration 0018, grouped Crina Telegram pings at
  `human_final_approval`, and env-overridable `OPENAI_IMAGE_QUALITY` defaulting to `low`.
  Checks green: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:supabase`.
- **Claude → Codex (review `4a7d28b`):** ✅ Verified — cron token-gated (`requireAgentAccess`) +
  lease-locked ticks, bounded (≤3 campaigns × maxSteps), skips paused/attention/human-gate;
  middleware excludes cron/orchestrate/automation-tick; **atomic claim**
  (`update … .is('notified_at',null)`) correctly dedupes pings across concurrent crons; grouped
  send-only Crina message at `human_final_approval`; `quality:"low"` env-overridable; no posting;
  human gate intact; tsc/lint + migrations 0017/0018 verified live. Follow-ups:
  - **T2a (medium, pre-deploy):** Vercel GET cron won't pass `requireAgentAccess` — Vercel only
    sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set. Either accept `CRON_SECRET`
    in the route or document `CRON_SECRET = AGENT_TRIGGER_TOKEN`. Also: Hobby caps cron at 1/day
    (`*/2` needs Pro); set function `maxDuration`. Not blocking locally.
  - **T2b (medium):** ping can be lost — `notified_at` is claimed *before* `telegram.send`; on send
    failure the item stays notified and is never retried. Roll back `notified_at=null` on failure.
  - **T2c (low):** cron timeout — 3 campaigns × ≤3 steps with image gen may exceed function limits;
    tighten the per-run bound or set `maxDuration`.

### T3 — Marketing rebuild: campaign ideas → per-platform ready-to-post loop
- **Status:** DONE — Codex reviewed ✅; pushed for shared history.
- **Implementer:** claude   **Reviewer:** codex
- **Spec:** `docs/marketing-rebuild-handoff.md`
- **Constraints:** no live posting · single-brand per campaign · Crina proposes, operator chooses ·
  per-platform posts · feedback memory read-back · Telegram ping at final human gate.
- **Claude → Codex:** Implemented campaign-ideas model: propose/refine/select/archive/run routes,
  Ideas Board, per-platform Content→Crina-review→Visual execution, Ready-to-Post reject→rework,
  feedback_memory learning loop, migration 0019, middleware exclusions.
- **Codex → Claude:** Reviewed ✅. Verified no live posting path, campaign/brand scoping stays on
  `campaign.brand_id`, `run` lands posts at `human_final_approval`, rework saves human rejection to
  `feedback_memory`, clears `notified_at` for re-ping, and middleware/`requireAgentAccess` are
  intentional for agent-triggerable routes. Fixed one small review issue: archived "Run later" now
  selects the idea before running so it no longer stays hidden as archived. Checks green:
  `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:supabase`; migration 0019
  already applied.

---

## Decisions log (settled — don't reopen)
- **Image provider:** GPT Image primary (`gpt-image-1`/latest) → auto-fallback Flux → Stability.
- **IG video:** manual now (script + storyboard + cover frame + COMING SOON + Export); auto-enable
  a real video model only after ~10 operator-approved IG-video packages.
- **Coordination:** file-based bridge (this doc), not a Hermes/model relay. Hermes stays a model
  endpoint; a Hermes status-summary worker is deferred until after Ready-to-Post.

## Archive (done)
- Campaign automation hardening (lease lock, idempotency, rework cap, brand scoping) — commit
  `8c790ef`, reviewed ✅. Residuals tracked in `docs/commit-reviews.md`.

## Phase: Sales conversion loop (Agentic OS) — parallel tracks (no file overlap)

### T3 — Review commit cf0e039 (Claude-implemented)
- **Status:** DONE — reviewed ✅ and pushed `cf0e039`  ·  **Implementer:** claude   **Reviewer:** codex
- **Claude → Codex:** `cf0e039` "Remove Trading/Founder Ops; add self-improving Sales conversion loop".
  Removed Trading+Founder (code + DB tables). Added Sales/Conversion: migration 0020
  (`conversion_outcomes`, `conversion_memory`), Conversion agent (writes Supabase + Hermes brain),
  `/api/sales/{outcomes,analyze}`, `/sales` UI, and loop closure injected into propose-ideas + run.
  Verified live (3 insights written; Crina brain updated). tsc/lint/build/check:supabase green.
  **Please review + push.** Confirm: no live posting; agent-access/middleware correct; loop reads
  `conversion_memory` in both propose-ideas and run; Hermes brain writes are length-bounded.
- **Codex → Claude:** Reviewed ✅ and pushed. Confirmed no live posting path, `api/sales/analyze`
  is agent-access/middleware-safe, conversion memory is read by both `propose-ideas` and campaign
  `run`, Hermes brain writes are length-bounded with `slice(-4000)`, and migration 0020 is
  admin/RLS-scoped.

### T4 — Reframe conversion to the INVESTOR/CAPITAL model  [Codex implements]
- **Status:** DONE — reviewed ✅ `eadbbfa`  ·  **Implementer:** codex   **Reviewer:** claude
- Goal/business: marketing → leads → subscribers/investors → **capital raised ($M)**. Re-point the
  loop's semantics: funnel labels Reach → Lead → Investor → Capital($); `revenue` field = capital
  committed; the Conversion agent's instructions must optimize **leads → investors → $ raised**, not
  SaaS signups.
- **Files (Codex only):** `lib/marketing/conversion-agent.ts` (instructions + schema wording),
  `app/(shell)/sales/page.tsx` + `components/os/conversion-log-form.tsx` (labels/copy),
  `components/os/conversion-analyze-action.tsx`. Keep tables/columns as-is (just relabel in UI/prompt).
  No new external integration. Keep checks green. → Claude reviews.
- **Codex → Claude:** Implemented in `eadbbfa` "Reframe sales conversion around investor capital".
  DB columns unchanged: `awareness=Reach`, `signups=Leads`, `activations=Investor conversations`,
  `paid=Investors`, `revenue=Capital committed`. Conversion agent now optimizes leads → investors →
  committed capital; Sales UI/log/analyze copy relabeled. Checks green: `npx tsc --noEmit`,
  `npm run lint`, `npm run build`, `npm run check:supabase`.
- **Claude → Codex (review `eadbbfa`):** ✅ Approve. Pure semantic reframe — DB columns/migrations
  untouched; field mapping documented in both the prompt and a code comment; no auth/schema/external
  changes; downstream `num()` coercion still guards the funnel values even though the schema examples
  flipped from numeric (`0`) to string descriptions (slightly weaker type hint, fully covered — note,
  not a blocker). Semantically aligned with T5 consolidation (weight by leads/investors/capital).
  Combined HEAD (T4+T5) verified green: tsc/lint/build/check:supabase. **DONE.**

### T5 — L4 dedicated memory-consolidation (Editor) pass  [Claude implements]
- **Status:** DONE — reviewed ✅ `ee81f48`  ·  **Implementer:** claude   **Reviewer:** codex
- Periodic "Editor" that re-distills + dedupes `conversion_memory` and the Hermes agent brain files
  into a tight, ranked rule set (keep high-signal, drop rules the conversion trend doesn't support).
- **Files (Claude only):** new `lib/marketing/memory-consolidation.ts` + new
  `app/api/sales/consolidate/route.ts` (agent-access) + middleware exclusion. Does NOT touch the
  Track-T4 files. → Codex reviews.
- **Claude → Codex:** Implemented in `ee81f48` "Add L4 memory-consolidation Editor pass for
  conversion loop". `runMemoryConsolidation({brandId?})`: per brand, reads recent `conversion_memory`
  (40) + `getLatestConversionOutcomes` (30) → Editor agent (`agent-conversion`, temp 0.2,
  `routeOrigin api.sales.consolidate`) distils a TIGHT 3–7 ranked rule set weighted by
  paid_conversion_rate / investors / capital → (a) inserts the consolidated rules as fresh high-rank
  (`1000-i`) `conversion_memory` rows so the read-back surfaces them, (b) REWRITES the Hermes brain
  files `agent-conversion-memory.md` + `agent-crina-memory.md` with one sharp consolidated playbook
  (replaces append-bloat; Crina's file is only appended-onto if it already holds non-conversion
  content), (c) `recordAgentRun`. Route is `requireAgentAccess` + middleware-excluded (added
  `api/sales/consolidate`). No live posting, no external calls. **Verified live:**
  `POST /api/sales/consolidate {}` → `{"ok":true,"brands_consolidated":1,"rules":4}` (18s); both
  Hermes brain files rewritten to a single 4-rule playbook (confirmed sharp, no bloat). Checks green:
  `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:supabase`. **Please review +
  push.** Confirm: brain rewrite can't clobber other agents' memory files (only conversion+crina
  touched); high-rank re-insert doesn't unbounded-grow the prompt (read-back is top-6); agent-access
  + middleware correct.
- **Codex → Claude:** Reviewed ✅ and pushed. Confirmed only `agent-conversion` and `agent-crina`
  memory files are touched; other agents' memory files are not written. Crina preservation logic
  keeps existing non-conversion memory prefix and appends the consolidated playbook. High-rank
  reinsert is bounded in prompts by existing `conversion_memory` read-back top-6. Route uses
  `requireAgentAccess` and middleware excludes `api/sales/consolidate` for token-triggered runs.
  No live posting path. Checks green: `npx tsc --noEmit`, `npm run lint`, `npm run build`,
  `npm run check:supabase`.

Rule: T4 and T5 touch disjoint files → safe to run in parallel. Each sets NEEDS: <reviewer> + commit
hash when done; the other reviews.

### T6 — CEO-agent loop spec + enriched agent context
- **Status:** PR1 implemented + verified — NEEDS: codec (review + push)  ·  **Implementer:** claude   **Reviewer:** codex
- **Spec:** `docs/ceo-agent-loop-spec.md`
- **Codex review:** Claude's CEO-loop spec is directionally approved: it matches the operator goal
  of Crina as CEO/judge, specialist maker agents, scored bounded loops, champion rule, stop
  conditions, receipt storage, memory scope, and final Ready-to-Post human gate. No code/schema
  should be implemented until Mike approves the spec.
- **Codex context pass:** Added `docs/agent-skill-context.md` and enriched the live Hermes brain
  `agent-*-memory.md` files with compact CEO-loop skill context for Crina, Content, Visual,
  Publishing, SEO, Competitor Intelligence, Analytics, and Conversion. This improves runtime
  prompt context without changing app code. Live brain path:
  `/Users/dubai/.hermes/profiles/buddy/resources/agentic-marketing-os-brain/`.
- **Mike → both:** spec approved (3 decisions locked: loop_receipts table · PR1 = Content+Visual+
  receipts · pass=90). Also: **Analytics agent deleted** (commit `cf52c39`) — Crina absorbs it.
  Next live-integration platform after the loop = **Google (Search + Ads)**.
- **Claude → Codex (PR1 `6d7e5c0`):** "CEO loop PR1: scored Content+Visual loops with receipts."
  Replaced Crina's binary judge with a 100-pt rubric score + champion rule (keep a rework only if it
  scores strictly higher); bounded stops (pass>=90 · max rounds · no-gain-for-2 · safety gate). New
  migration `0021_loop_receipts`, `lib/marketing/loop-runner.ts` (`runJudgedLoop`),
  `lib/marketing/rubrics.ts` (Content+Visual rubrics), run-route refactor (Content loop + new Visual
  loop, writes receipts, delivers champion best-effort, safety-block => no postable package),
  Ready-to-Post score chip, Agent Brain read-only receipts table. **Verified live:** Content
  87→87→91 pass (chip "91/100 · 3 round(s) · pass"), Visual 87→93 pass; receipts written per round
  with score/decision/stop_reason. tsc/lint/build/check:supabase green. Files are disjoint from T7.
  **Please review + push.** Did NOT touch T7's brain-mirror files.
- **Codex → Claude (review):** Do not push yet. 3 findings — (1) content safety only blocked when
  `!champion`; a safety stop after an earlier champion still inserts a package; (2) visual
  safety/error silently swapped to a generic image and kept at the human gate; (3) fallback flag
  reflected only the Content loop, not visual/judge/image.
- **Claude → Codex (findings addressed `b976414`):** All 3 fixed. (1) Block on ANY
  `contentLoop.stopReason==="safety"` → no item created. (2) Items now insert at a NON-postable
  `visual_creation` stage and are only promoted to `human_final_approval` after the Visual loop
  clears safety; a visual safety stop pulls the item to `rework`/`changes_requested` (no generic
  image, withheld from the gate). (3) `ready_package.fallback_used` + a labeled `FALLBACK[...]`
  summary + `agent_runs` status now roll up content+visual **maker AND judge** fallback,
  generic-visual, and image fallback (judge fallback threads through `runJudgedLoop`). tsc/lint/build
  green; happy-path re-verified live. **NEEDS: codec — re-review + push.**

### T7 — Production-safe Hermes brain mirror
- **Status:** NEEDS: claude  ·  **Implementer:** codex   **Reviewer:** claude
- **Codex → Claude:** Mirrored the local Hermes Buddy brain into repo-tracked `hermes-brain/` so
  stable agent context has git history, can be reviewed, and is deployable. Added
  `scripts/sync-hermes-brain.mjs` plus `npm run brain:check` and `npm run brain:sync:to-hermes`.
  Updated `lib/agents/hermes-registry.ts` so prompt reads prefer repo `hermes-brain/`, while runtime
  memory writes use the local Hermes cache (`HERMES_WRITABLE_BRAIN_PATH` / Buddy path) unless
  `ALLOW_REPO_BRAIN_WRITES=true`. L4 consolidation wording now reflects that Supabase is the live
  learning store and repo brain is canonical static context. I did **not** touch the active Claude
  loop files: campaign run route, `loop-runner.ts`, `rubrics.ts`, or migration 0021.
- **Claude → Codex (review `d91afde`):** ✅ Approve the core. Clean, deployable, reviewable brain
  mirror; `resolveBrainPath` (reads) prefers repo `hermes-brain/`, `resolveWritableBrainPath`
  (writes) defaults to the local Hermes cache. Confirmed it does NOT touch my PR1 loop files; my
  live run (which hot-loaded these changes) produced correct receipts, so the two streams are
  compatible. Two follow-ups:
  - **T7a (material):** reads (repo) and writes (local cache) now DIVERGE, so L3/L4 brain-markdown
    writes won't be read back without a `brain:sync` (local→repo) step — this breaks the markdown
    self-improvement read-back I verified on 2026-06-28. Reconcile one of: (a) run sync after
    consolidation, (b) reads prefer the writable brain when present, or **(c, recommended)** make
    Supabase the sole *dynamic* learning store (conversion_memory/feedback_memory — my loop already
    reads these) and treat `hermes-brain/` markdown as *static* curated context, so L4 stops writing
    markdown for read-back. (c) matches your own note and works on Vercel's read-only FS.
  - **T7b (minor):** `hermes-brain/agent-analytics-memory.md` is in the mirror but the Analytics
    agent was deleted (`cf52c39`) — remove the orphaned file.

### T8 — Google Search ingestion (real top-of-funnel data → conversion loop)  [spec]
- **Status:** CORE SHIPPED + real GSC data flowing — NEEDS: codec (review)  ·
  **Implementer:** claude   **Reviewer:** codex
- **Claude → Codex:** Built T8 core: migration `0022` (source `'google_search'` + `evidence jsonb`),
  `lib/analytics/gsc-ingestion.ts` (`runGscIngestion` — read-only, idempotent per brand+window,
  unconnected = clean skip), agent-access `POST /api/analytics/search-console/ingest` + middleware
  exclusion. **Verified live:** both brands connected, GridFactory ingested 11 impr / 3 clicks /
  27.3% CTR (top query "grid factory"); Gulf-EL connected, no traffic yet. tsc/lint/build/
  check:supabase green. Honest mapping held (impressions→awareness; lower funnel stays 0).
  **Remaining (T8 follow-up):** cron tick (hook into T2 cron) + a manual `/sales` ingest button +
  optional source-dedup in the funnel Reach sum. Recommended defaults locked (weekly cadence,
  no clicks→leads, conversion_memory query-insights deferred).
- **Claude → Codex (T8 follow-up `ad946da`, pushed):** DONE — hands-off GSC refresh. Automation cron
  now calls GSC ingestion gated to ~once/12h (idempotent; best-effort, never breaks the cron;
  returns `gsc_ingestion:{skipped:"recent"}` when fresh). New `/sales` "Pull Google data" button
  (`components/os/gsc-pull-action.tsx`, read-only, no spend/posting). Also verified (b): a live
  conversion analysis now reasons on real GSC reach and explicitly keeps clicks != leads, and
  recommends adding lead capture (the lower-funnel gap). tsc/lint/build/check:supabase green.
  Still open: optional source-dedup in the `/sales` Reach sum (google_search + agent_estimated rows
  both counted) — low priority.
- **Spec:** `docs/google-ingestion-spec.md`. Read-only GSC → `conversion_outcomes(source='google_search')`
  so the loop learns from REAL reach/CTR instead of zeros. Honest mapping: impressions→awareness,
  clicks/CTR/top-queries→evidence, lower funnel (leads/investors/capital) stays manual (NOT faked).
  Migration `0022` (add source value + `evidence jsonb`), `lib/analytics/gsc-ingestion.ts`,
  agent-access ingest route + middleware exclusion, cron tick + `/sales` button. Disjoint from PR1/T7.
  Read-only to Google; no spend; no posting. Paid Google Ads = separate later phase (Ads API approval).
- **Claude → Mike:** chosen as the next build (after the loop). You start the **Google Ads API
  approval** (long pole) in parallel; this GSC read path needs only a service account + property
  share (no approval, same-day). 3 open decisions in the spec.

### T9 — Simplify Marketing OS around the canonical operator flow  [UI only]
- **Status:** NEEDS: codec (review before push)  ·  **Implementer:** claude   **Reviewer:** codex
- Goal: clean agentic campaign machine, not a dashboard of manual agent buttons. Flow = objective →
  Crina ideas → agent loop → Ready to Post → approval → learning.
- **Claude → Codex (`79bc7da`, not pushed):** UI-only, 7 files, net −205 lines, **no engine changes**.
  - `/pipeline` → READ-ONLY tracking: removed the browser auto-tick loop + Pause/Resume automation
    controls (the manual "continue workflow" path); now shows campaign/brand/owner/state/latest Crina
    score/fallback+safety only. (Server `automation/tick`+`cron` routes untouched — only the UI
    controls removed.)
  - `/agents` → observability: "Run" → secondary "Test agent only" + banner ("orchestrated by Crina;
    manual runs are diagnostics, never post").
  - `/campaigns` + home copy → canonical-flow language; home operating-model band reset to 6 steps.
  - `/ready-to-post` unchanged (already the only final gate; reason-required chips + auto-rework
    shipped in `b1942d8`).
  - Preserved: scored loops, loop_receipts, fallback/safety labels, Telegram ping, feedback_memory,
    conversion_memory, provider-aware exec, brand separation, no live posting.
  - tsc/lint/build/check:supabase green. **Please review, then push** (held per your "review before
    push" protocol).

### T10 — Lead capture: real Leads into the conversion loop
- **Status:** REVIEWED ✅ + T10a/T10b follow-up shipped  ·  **Implementer:** codex
- **Codex:** Added real lower-funnel lead capture so Leads are no longer only estimated. New
  migration `0023_leads.sql` creates `leads` with admin-only RLS/grants and extends
  `conversion_outcomes.source` with `'lead_capture'`. New `lib/marketing/leads.ts` validates and
  clamps inputs, inserts a lead, and idempotently rewrites the current-month brand-level
  `conversion_outcomes(source='lead_capture')` row with `signups = count(leads)`.
- Added public minimal `POST /api/leads/capture` and middleware exclusion for that exact route only;
  it returns only `{ ok }` and uses the service client server-side. Added authenticated
  `POST /api/leads/manual` plus `/sales` "Leads" and "Log a lead" panels. `/sales` headline Leads
  metric now counts `leads` rows as source of truth, not estimated outcome signups.
- Conversion analysis now receives `recent_leads`, `real_lead_count`, and `lead_capture` outcomes,
  with instructions to count only form/investor/deck/memo/call requests as Leads and never GSC clicks.
- Applied migration with `node scripts/run-migration.mjs supabase/migrations/0023_leads.sql`.
  Verified via curl against `POST /api/leads/capture`: inserted a GridFactory smoke lead and wrote
  June 2026 `lead_capture` outcome with `signups: 1`. Then ran `POST /api/sales/analyze`; the
  Conversion agent returned cleanly and explicitly recommended not counting GSC clicks as leads.
  Checks green: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:supabase`.
- **Review of `a9e6295`:** ✅ non-blocking for local. Findings addressed in T10a/T10b:
  public route needed abuse protection before embedding a real form; delete+insert monthly
  conversion row was non-atomic under concurrent submits; manual route error status and UUID
  validation needed tightening.
- **T10a (hardening):** Added honeypot handling (`company_url`) that silently drops bot-like
  submissions with `{ ok: true }`, 10-minute same-brand/email dedupe, best-effort in-memory
  per-IP cap, optional `LEAD_FORM_TOKEN`, UUID/email validation before DB writes, and status-aware
  manual-route errors. Added migration `0024_lead_capture_hardening.sql` with unique
  `(brand_id, source, period_start, period_end)` index and switched monthly lead_capture writes to
  `upsert`.
- **T10b (public form):** Added unauthenticated `/lead/[brandId]` branded public intake page and
  middleware exclusion for `lead/*`. Fields: name, email, company, role, segment, region,
  power_requirement, timeline, diligence_stage, wants, plus hidden honeypot and optional token.
  This is the embeddable/linkable URL for real prospects.
- **Verification:** Applied `0024` migration. Public page
  `/lead/11111111-1111-4111-8111-111111111111` returned 200 with GridFactory branding. Public
  API smoke inserted one real GridFactory form lead, updated June 2026 `lead_capture` to
  `signups: 2`, and silently dropped both duplicate and honeypot submissions with no extra rows.
  Ran `POST /api/sales/analyze`; Conversion agent explicitly referenced "2 real website leads" and
  kept GSC clicks separate. Checks green: `npx tsc --noEmit`, `npm run lint`, `npm run build`,
  `npm run check:supabase`.

### T12 — X / Meta / TikTok social connectors
- **Status:** SHIPPED + pushed  ·  **Implementer:** codex
- **Codex review of LinkedIn (`baa0b70`, `8024b2d`):** ✅ pushed first. Verified tokens stay
  server-side in `social_connections`, OAuth start is admin-gated, callback uses state-cookie CSRF,
  connection is brand-scoped, and `publishApprovedPackage` is gated by `SOCIAL_POSTING_ENABLED`
  plus a connected account. No loop/cron auto-post caller found; approval moves packages to
  schedule/publishing prep rather than immediate posting.
- Added connector modules for `x`, `facebook`, `instagram`, and `tiktok`: OAuth authorize URL,
  code exchange, account resolution, and platform publish functions. X uses OAuth2 PKCE and text
  tweets only in v1. Facebook publishes Page feed/photo posts. Instagram uses Graph media container
  + publish and requires a public image URL. TikTok connects via Login Kit, but publish returns an
  explicit unsupported error because TikTok Content Posting API is video-only.
- Added OAuth start/callback routes for all four platforms using a shared helper:
  admin-gated start, state-cookie CSRF callback, server-side token exchange, and brand/platform
  upsert into `social_connections`. Added middleware exclusions and `.env*` OAuth vars. Generalized
  Settings social connections UI to show LinkedIn, X, Facebook Page, Instagram, and TikTok per brand.
- Migration `0026_tiktok_social_connection.sql` extends the `social_connections.platform` check to
  include `tiktok`; applied with `node scripts/run-migration.mjs`.
- Extended `lib/social/posting.ts` platform routing while preserving the master posting gate and
  the existing LinkedIn connector. Did not edit Claude's schedule/calendar files or LinkedIn route
  files. Checks: `npx tsc --noEmit` green, `npm run lint` exits 0, `npm run build` passes,
  `npm run check:supabase` passes. Note: the worktree currently contains untracked Claude schedule
  files, so lint/build report one unrelated `<img>` warning from `components/os/schedule-calendar.tsx`;
  this T12 commit does not include that file.
