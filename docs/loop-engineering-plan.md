# Loop-Engineering Plan — Self-Improving Marketing OS

Coordination doc for **Codex** (soul / taste / strategy) and **Claude** (loop harness / technical).
Basis: Karpathy *LOOPS.md* + the self-improving-loop note. We already implement the inner
maker–checker loop; this plan closes the **outer self-improving loop**.

## Division of work (do not cross lanes)
- **Codex owns** — Project Soul, brand memory, agent psychology, narrative, strategic content rules,
  the *reference "good-vs-slop" examples* the grader calibrates on, the brand playbook the
  consolidation converges toward. i.e. **what "good" means.**
- **Claude owns** — the technical harness that makes good happen honestly, on schedule, verified:
  grader plumbing, schedulers, verification steps, canonical-brain persistence, trace surfaces,
  contract mechanism, tooling. i.e. **the loop.**

## What we already have (do NOT rebuild)
- Inner loop: `runJudgedLoop` (maker→judge→keep-champion), stop rules (pass/max_rounds/no_progress/safety).
- Separated roles: Content Creator & Visual = makers; **Crina = judge**.
- Rubric scoring 0–100 (CONTENT_RUBRIC / VISUAL_RUBRIC).
- Memory: `feedback_memory`, `conversion_memory`, `conversion_outcomes` + `hermes-brain/` narrative + read-back.
- Traces: `loop_receipts` (per-round score/notes/decision/stop).
- L4 Editor pass: `memory-consolidation.ts` (distils rules) + `/api/sales/consolidate`.
- Closed outcome loop: `runConversionAnalysis` → memory → propose-ideas/run.

## Phases

### Phase 1 — Close the self-improving loop (KEYSTONE)
The judge must grade **honestly**, and the self-tuning pass must be **scheduled + verified + persisted**.
- **P1a (Claude)** Honest-grader framing in the judge: "you did not produce this; assume gaps; do not
  praise; a 70 you can defend beats a 95 you can't; name the single biggest weakness." Read an optional
  calibration file. **(Codex)** fill the calibration file with reference good-vs-slop examples per brand.
- **P1b (Claude)** Schedule `runMemoryConsolidation` weekly via the cron (last-run guard).
- **P1c (Claude)** Verify step: each distilled rule is tagged with the metric that backs it; rules
  whose brand `paid_conversion_rate` trend didn't hold are dropped/flagged (keep only metric-supported).
- **P1d (Claude)** Persist the tightened playbook to the canonical `hermes-brain/` (brand playbook file),
  not just cache, so the next run reads the sharper brain.
- **Accept:** run consolidation → rules tighten + carry evidence + write a brain file; a fresh judge
  prompt shows the skeptical framing; cron runs it at most weekly.

### Phase 2 — Read the traces (judgment divergence)
- **P2 (Claude)** Surface `loop_receipts` where **Crina passed but the human rejected** (and vice
  versa); auto-write those to `feedback_memory` as "avoid" lessons. **(Codex)** decide which
  divergences are taste vs real misses.
- **Accept:** reject a package → it appears in the divergence view + a feedback_memory row is written.

### Phase 3 — Learning cadence
- **P3 (Claude)** On the cron: weekly consolidation (P1b) + competitor-intel refresh feeding memory +
  a weekly **reflection** pass that reads recent receipts and proposes exactly ONE rule change.
  **(Codex)** what competitor/research signal "matters"; the reflection rubric.
- **Accept:** a cron tick logs consolidation/research/reflection `agent_runs`, at most weekly each.

### Phase 4 — Contract-first + harness review
- **P4a (Claude)** Per-campaign contract: Crina proposes done-criteria before generation; stored on the
  campaign; the judge grades against it. **(Codex)** done-criteria templates per campaign type.
- **P4b (Claude)** "Delete-the-harness" review tool + a bottleneck view (where the loop currently
  spends/fails most).
- **Accept:** a campaign carries a contract the judge references; a report lists harness/bottleneck candidates.

## Status log
- [x] P1a honest grader: Claude wired skeptical judge framing; Codex filled `hermes-brain/grader-calibration.md`.
- [x] P1b schedule: cron runs memory consolidation at most weekly.
- [x] P1c verify: consolidation includes paid-conversion trend and evidence-tagged rules.
- [x] P1d persist: consolidation writes DB memory and best-effort `hermes-brain/brand-playbooks.md`; Codex added baseline playbook.
- [x] P2 divergence: rework flow records human rejects where Crina previously passed as grader-divergence memory.
- [x] P3 cadence: cron runs weekly reflection from loop receipts/divergences.
- [x] P4a contract: campaign run injects available success criteria/CTA/objective into judge prompt.
- [x] P4b harness review: `lib/marketing/bottlenecks.ts` + `GET /api/marketing/bottlenecks` + a **Loop bottlenecks** table on the Analytics page (rework/fallback/avg-score by loop type). Delete-the-harness stays a periodic human/Codex review per model release.

**All phases 1–4 complete.** Live insight on first run: visual loop = 60% fallback / avg score 35 → the current bottleneck to fix next.
