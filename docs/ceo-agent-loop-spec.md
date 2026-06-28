# CEO-Agent Loop Spec — Crina orchestrates bounded, scored, receipted loops

**Status:** SPEC — awaiting approval. No code, no schema change until approved.
**Author:** Claude · **Reviewer:** (Codex) · **Bridge thread:** T6 (proposed)

## Why this exists
We already run a bounded Content→Crina review loop and a Sales/Capital learning loop.
This spec upgrades them to the **Loop Library discipline** (Forward Future / Loopy): every
loop has a **goal**, a **measurable acceptance check**, a **learning step**, a **stop/handoff
rule**, **bounded rounds**, an explicit **human-approval boundary**, **failed outputs become
memory**, and **every run produces a receipt**. The headline change: replace Crina's binary
`approve | rework` judgment with a **numeric rubric score** and a **keep-only-if-it-improves**
(champion) rule, so each loop measurably converges instead of looping on vibes.

### Grounding — real Loop Library loops used as scaffolds (adaptations, not published as-is)
- **#019 Clodex adversarial-review** → maker/judge rounds; stop when judge approves or only
  accepted findings remain, with an iteration cap. (Content & Visual loops.)
- **#023 self-improving champion** → accept a challenger only if it beats the champion on a
  fresh check, no regression. (The "keep only if score improves" + anti-overfit rule.)
- **#027 autonomy builder-reviewer** → deterministic gates, protected paths stay human-gated,
  circuit breaker on stall. (Bounded rework + Ready-to-Post human gate + safety stop.)
- **#028 completion-contract** → every requirement has current proof; partial ≠ done. (Final
  package assembly check.)
- **#024 devil's-advocate** → a two-round stalemate is recorded truthfully. (No-progress stop.)

Current published loops are the source of truth; the above are adaptations for our domain.

---

## A. CEO Loop Model

- **Crina owns campaign-level orchestration.** She plans the package (which platforms / content
  types a campaign needs), delegates each piece to the right specialist, judges every output
  against a rubric, sends back for rework within bounds, assembles the final package, and only
  then hands to the human at the Ready-to-Post gate.
- **Subagents do specialist work only** (Content Creator, Visual & Video, Publishing, SEO,
  Conversion, Competitor Intelligence). They produce one candidate per request. **Crina (CEO)
  absorbs performance analysis** — there is no separate Analytics agent.
- **Subagents never decide final readiness.** Only Crina scores; only the human approves to post.
- **Crina judges every specialist output** with a concrete 100-point rubric (Section D) and
  returns `{ score, decision, judge_notes, improvements }`.
- **Maker ≠ judge** (independent verification, per #023/#027): the agent that *makes* a draft is
  never the agent that *scores* it. Content Creator makes; Crina scores. This already holds in
  the current run route and must be preserved.
- **The human sees only final packages**, never internal loop rounds. Internal rounds are visible
  only as read-only receipts on the Agent Brain page.

Terminal handoff: a campaign run produces, per platform, exactly one of —
`ready_for_human` · `exhausted_best_effort` · `stalled_best_effort` · `safety_blocked` ·
`error_blocked`. The first three deliver a package to the human gate (the latter two flagged
low-confidence); `safety_blocked`/`error_blocked` deliver **no** postable package and never
report success.

---

## B. Loop Types (reusable patterns)

Each loop = Plan → Delegate (one bounded candidate) → Judge (rubric score) → keep-best →
rework or stop → receipt. All share the contract (C), stop rules (E), and memory rules (F).

**1. Content quality loop** *(exists today as binary; upgrade to scored)*
- Goal: a platform-ready post that scores ≥ 90 on the Content rubric.
- Action: Content Creator drafts (or reworks against Crina's last `improvements`).
- Check: Crina scores with the Content rubric.
- Stop: score ≥ 90 (pass) · 3 rounds reached (exhausted) · no score gain for 2 rounds (stalled)
  · any safety violation (safety_blocked). Keep the highest-scoring draft seen (champion).

**2. Visual quality loop** *(new)*
- Goal: an image/carousel concept+prompt that scores ≥ 90 on the Visual/Carousel rubric and
  matches the approved post.
- Action: Visual & Video Agent produces prompt + concept (image generation stays on the existing
  fallback chain; COMING SOON for unrendered video).
- Check: Crina scores visual-fit vs the post. Stop rules as above.

**3. Publisher safety loop** *(new — packaging only, no live posting)*
- Goal: a publish-ready **draft package** that passes the Publishing rubric, with the
  no-live-posting guarantee as a hard gate.
- Action: Publishing Agent assembles platform package (format, char limits, hashtags, schedule
  metadata, asset references) — **draft only, never posts**.
- Check: Crina verifies platform fit, claims/compliance, CTA correctness, schedule sanity. Any
  live-post path or unapproved claim → immediate safety_blocked.

**4. SEO/GEO loop** *(new)*
- Goal: a brief/page that is answer-ready for the target search intent and on-brand (≥ 90 SEO
  rubric).
- Action: SEO Agent audits topic/page/intent and proposes the improvement.
- Check: Crina scores usefulness, search-intent match, and brand fit. Stop rules as above.

**5. Conversion/capital loop** *(exists today as L3/L4 — keep, wire receipts)*
- Goal: distilled, ranked "what raises leads/investors/capital" that Crina reads into future
  ideas (Reach → Lead → Investor → Capital($)).
- Action: Conversion Agent reads outcomes → ranks; L4 Editor consolidates.
- Check: ranked by objective signal (paid_conversion_rate / investors / capital); the consolidator
  refuses to treat unverified outcomes as proven (already verified live). Emit a loop receipt.

---

## C. Required Loop Contract (every loop round records a receipt)

| Field | Source / notes |
|---|---|
| `loop_id` | uuid per campaign-platform loop run (groups its rounds) |
| `campaign_id` | from the run |
| `content_item_id` | the item under work (null for conversion loop) |
| `agent_id` | the maker for this round (e.g. `agent-content-creator`) |
| `round_number` | reuse `content_items.loop_iteration` semantics (0-based) |
| `input_summary` | short text — what the maker was asked/given (no full prompt dump) |
| `output_summary` | short text — what the maker produced |
| `score_before` | champion score entering the round (null on round 0) |
| `score_after` | rubric score of this round's candidate |
| `judge_notes` | Crina's concise critique (bounded length) |
| `decision` | `pass` \| `rework` \| `fail` \| `needs_human` |
| `fallback_used` | boolean (provider/model fell back) |
| `provider` / `model` | from `runMarketingAgentModel` result |
| `tokens` | prompt/completion/total if available |
| `latency_ms` | round duration |
| `stop_reason` | `pass` \| `max_rounds` \| `no_progress` \| `safety` \| `error` \| `needs_human` |

**Storage decision (LOCKED):** a new **`loop_receipts`** table (one row per round) — clean to query
for the Agent Brain page and debriefs. Migration `0021_loop_receipts.sql` with RLS + `is_admin()`
policies + grants + `notify pgrst`, mirroring the `0020` style. Drafted only after implementation
is approved, per constraints.

---

## D. Scoring Rubrics (concrete 100-point; pass ≥ 90)

Every rubric includes a **compliance/safety** dimension that is *also a hard gate*: any safety
violation forces `score = 0` and `stop_reason = safety` regardless of other points. Crina returns
`{ score: 0-100, dimension_scores: {...}, safety_pass: bool, decision, judge_notes, improvements[] }`.

**Content (social post)**
| Dimension | Pts |
|---|---|
| Brand fit & voice | 15 |
| Audience fit | 10 |
| Platform fit (format/length/tone) | 15 |
| Clarity & hook strength | 15 |
| Proof / credibility (specific, verifiable) | 15 |
| CTA strength | 10 |
| Non-genericness (distinct, not template-y) | 10 |
| Compliance/safety (no unapproved claims, no live-post language) **[gate]** | 10 |

**Visual / Image**
| Brand fit (palette/style) 20 · Concept↔message fit 20 · Platform fit (aspect/format) 15 ·
Clarity/focal point 15 · Non-genericness (not stock-cliché) 15 · Compliance/safety (no misleading
imagery, no real-person likeness, no unapproved logos) **[gate]** 15 |

**Carousel**
| Brand fit 15 · Narrative arc hook→value→CTA 20 · Per-slide clarity (one idea/slide) 15 ·
Platform fit (slide count/format) 10 · Proof/credibility 15 · CTA-slide strength 10 ·
Non-genericness 10 · Compliance/safety **[gate]** 5 |

**Short video script**
| Hook in first 3s 20 · Brand & audience fit 15 · Pacing/retention 20 · Single-message clarity 15 ·
CTA strength 10 · Non-genericness 10 · Compliance/safety (claims; COMING SOON for unrendered
video) **[gate]** 10 |

**Publishing package** (safety-weighted)
| Platform fit (format/limits/hashtags) 20 · Claims/compliance check 25 · CTA correctness & link
hygiene 15 · Schedule sanity (metadata only, not posting) 10 · Completeness (assets present,
fallbacks labeled) 20 · No-live-posting guarantee **[gate]** 10 |

**SEO / blog (GEO)**
| Search-intent match 20 · Usefulness / answer-ready 20 · Brand fit 15 · Clarity & structure 15 ·
Proof/credibility (sources/specifics) 15 · Non-genericness 10 · Compliance/safety **[gate]** 5 |

**Investor / capital conversion strength**
| Lead→investor relevance 25 · Capital-readiness/diligence signal 20 · Proof/credibility (concrete,
no hype) 20 · Brand fit 10 · Clarity of the diligence next-step (CTA) 15 · Compliance/safety (no
unapproved funding/return claims) **[gate]** 10 |

---

## E. Stop Conditions (bounded loops)

- **Pass:** `score ≥ 90` → `stop_reason = pass`, item → Ready-to-Post (human gate).
- **Max rounds:** default **3 rounds** per loop (1 initial + up to 2 reworks; matches current
  `MAX_CRINA_ROUNDS=2`) → `stop_reason = max_rounds`, deliver the **champion** (best-scoring
  draft) flagged low-confidence.
- **No progress:** if `score_after ≤ champion score` for **2 consecutive** rounds → `no_progress`,
  deliver the champion (stalemate recorded truthfully, per #024).
- **Safety/compliance:** any safety-gate failure → **immediate** `safety` stop, **no** postable
  package produced.
- **Error:** provider/model hard failure with no usable candidate → `error` (never reported as
  success); fall back per existing chain or hand to human.
- **Human boundary:** the human is invoked **only** at the final Ready-to-Post package gate, or on
  unresolved ambiguity Crina explicitly flags `needs_human`. Internal rounds never page the human.

**Keep-only-if-it-improves (champion rule, per #023):** within a loop, retain the highest-scoring
candidate as champion. A rework round replaces the champion only if it scores strictly higher.
This prevents "rework made it worse" regressions and gives the no-progress detector its signal.

---

## F. Memory Rules

- **On every pass/reject/rework**, write a **compact** learning (one or two lines), never a dump.
- **Channels (reuse existing):**
  - Human final decisions → `feedback_memory` (existing; `decided_by='human'`).
  - Conversion/capital learnings → `conversion_memory` (existing, ranked).
  - Per-round agent learnings (what the rework fixed / why a draft failed) → the **loop receipt**
    (`judge_notes` + `output_summary`), which the **L4 consolidator** later distills. Failed
    outputs thus become memory (evidence), not discarded work.
- **Never append unbounded text to the agent brain.** The Hermes brain receives only the
  L4-consolidated, ranked distillation (already built and length-bounded).
- **Scope every memory by `brand_id` + `platform` + `content_type`.** Crina reads only the
  **top-ranked relevant** slice (existing: `getFeedbackMemoryContext` top-5,
  `getConversionMemoryContext` top-6).
- **Brand separation is strict:** GridFactory.io and Gulf-EL/NexRide memories never cross-read.

---

## G. UI Rules (no confusing internal-loop buttons)

- **Campaigns:** ideas, selected campaigns, and a coarse status only — `idea` / `working` /
  `on_review` / `ready`. No per-round or per-subagent buttons.
- **Ready to Post:** final review only, plus a one-line receipt chip per item
  (e.g. "Crina 92/100 · 2 rounds · pass"). Approve / reject(rework) as today.
- **Sales/Capital:** Reach → Lead → Investor → Capital($) learning, unchanged.
- **Agents / Brain:** observability — read-only loop receipts, scores over time, and brain
  contents. **No manual task-trigger controls** here.

---

## H. Implementation Plan (proposed sequence — after approval)

1. **Loop receipt storage** — create `loop_receipts` (migration `0021`, RLS + `is_admin()`). LOCKED.
2. **Shared loop runner** — `lib/marketing/loop-runner.ts`: a generic bounded judge loop
   `runJudgedLoop({ make, judge, rubric, maxRounds=3, passScore=90 })` that runs maker → Crina
   judge(score) → keep champion → applies stop rules (E) → writes a receipt (C) per round. Pure
   helper; provider-aware via `runMarketingAgentModel`.
3. **Refactor campaign run** — replace the inline binary loop in
   `app/api/marketing/campaigns/[id]/run/route.ts` with `runJudgedLoop` for the **Content loop**,
   and add the **Visual loop**. Behavior-preserving except: scored judging + receipts. Keep
   `MAX_PLATFORMS` bound and the Telegram ping at the human gate.
4. **Crina judge prompts + rubrics** — encode Section D rubrics as judge instructions returning
   the structured `{ score, dimension_scores, safety_pass, decision, judge_notes, improvements }`.
5. **Store loop receipts** — one per round, via the chosen storage.
6. **Surface receipts** — a one-line receipt chip on Ready-to-Post, and a read-only receipts view
   on the Agent Brain page. No new operator controls.
7. **Keep all checks green** — `npx tsc --noEmit`, `npm run lint`, `npm run build`,
   `npm run check:supabase` after each step.

**Scope discipline (LOCKED):** **first PR = Content loop (scored) + Visual loop + receipts +
Ready-to-Post chip**, built on the shared `runJudgedLoop` helper. Publisher / SEO / Conversion
loops reuse the same helper and land in follow-up PRs — specified here, not shipped in PR 1.

---

## Constraints honored
- No live posting (Publishing Agent packages drafts only; no-live-post is a hard gate).
- No new external integrations.
- **No schema change until this spec is approved** (migration `0021` is drafted only post-approval).
- GridFactory.io and Gulf-EL/NexRide kept strictly separated in all memory reads.
- Sales/Capital model unchanged: Reach → Lead → Investor → Capital($).
- Provider-aware execution only (`runMarketingAgentModel`); reuse `agent_runs` + existing memory.

## Locked decisions (confirmed by operator)
1. **Receipt storage:** dedicated **`loop_receipts`** table (migration `0021`).
2. **First-PR scope:** **Content + Visual loops + receipts** (+ Ready-to-Post chip). Publisher/SEO/
   Conversion-receipts follow in later PRs.
3. **Pass threshold:** **90 across the board** for every content type.

## Awaiting
Operator approval to **begin implementation** (the migration `0021` and code). No schema or code
changes until that explicit go.
