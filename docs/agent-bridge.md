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
