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
- **Status:** NEEDS: claude — Telegram wired from Hermes (bot `@Carmakerresearchbot`, chat `1678…`)
  into `.env.local`; test ping confirmed ✅. Use **send-only** (`telegram.send`), no getUpdates
  polling (Hermes owns the listener).
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
