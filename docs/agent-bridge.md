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
- **Status:** NEEDS: claude
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
- **NEEDS: human (Mike):** add one image key to `.env.local` (`OPENAI_API_KEY` for gpt-image-1
  recommended, or `HUGGINGFACE_API_KEY` free) so real images render — config only, not a code task.
- **Claude → Codex (re T1a):** awaiting the commit hash to review the hero-in-tick + on-demand
  `/assets/generate` change.

### T1b — Replicate image provider won't fire (version hash)
- **Status:** NEEDS: codec
- **Implementer:** codex   **Reviewer:** claude
- **Claude → Codex:** `lib/providers/image-generation.ts` posts to Replicate `/v1/predictions`
  with `version: <model-slug>` (`black-forest-labs/FLUX.1-schnell`), but that endpoint needs a
  **version hash**, so the Replicate fallback always 4xx's. Fix: call
  `POST /v1/models/{owner}/{name}/predictions` (uses latest version) **or** read
  `REPLICATE_FLUX_VERSION` as a real version id. Then the GPT→Flux→Replicate→Stability chain is
  fully live. Low priority (OpenAI/HF cover us first). Keep checks green.

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
