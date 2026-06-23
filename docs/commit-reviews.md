# Marketing OS — Commit Reviews (Claude)

Review log for the campaign automation work. Each entry is a read-only review of a
specific commit (no code changed during review). Canonical product rules live in
`marketing-plan.md`; this file is the running review/risk record handed to Codex.

Non-negotiables that every commit is checked against:
- No live publishing. Drafts/packages only. Human approval gate is never bypassed.
- Brand scope stays single-brand per campaign unless cross-brand is explicitly enabled.
- Every model call logs to `agent_runs` with provider/model/fallback metadata.
- Fallback output is visibly labeled `FALLBACK`.

---

## Outstanding issues (consolidated — start here)

Open items across all reviewed commits, highest value first:

1. **Manual multi-tab acceptance test still recommended (medium).** The code now has a
   server-side lease lock, but the exact browser-tab race should be tested against a live
   campaign after this hardening pass.

Closed in the latest Codex hardening pass:

- **Server-side idempotency / locking:** `execute`, `orchestrate`, and
  `automation/start` now use campaign-level `automation_running` +
  `automation_lease_until` lease state and return `{ skipped: true, reason:
  "already running" }` instead of failing when another worker owns the campaign.
- **Pipeline waiting auto-start:** Pipeline no longer auto-starts campaigns in the
  `waiting` lane.
- **Cross-brand brain leak in campaign runners:** campaign execute/orchestrate calls
  no longer request combined brand-voice/CTA brain files; they rely on the single
  resolved campaign brand in `input` plus non-brand-specific operating rules.
- **Per-item rework cap:** `content_items.loop_iteration` caps internal Crina rework
  at 3 and then forces the item to the human gate with a needs-human-review note.
- **Attention/paused lane visibility:** Pipeline lane cards show automation state for
  non-selected campaigns.
- **Step persistence mismatch:** step result status now becomes `error` if `saveItem`
  fails.
- **React updater side effect:** `setAttentionIds` was lifted out of the
  `setNoProgressCounts` updater.

---

## 591f407 — Start Crina campaign execution from approved objectives

Files: `app/api/marketing/campaigns/[id]/execute/route.ts`, `components/os/campaign-workspace.tsx`.

- Approval (status → `active`) auto-triggers Crina; explicit button also present. Gated by
  `requireAdmin` + `status === "active"` (409 otherwise). **OK.**
- Brand-scoped at the record level (`brand_id = campaign.brand_id`, single-brand `input`).
  **Risk:** shared brain not brand-filtered (issue #3).
- Duplicate seed prevented via existing-items check (`performance_summary` LIKE sentinel),
  idempotent for re-runs. **Risk:** TOCTOU race, string sentinel (issue #1).
- Provider/model/fallback logged to `agent_runs` and embedded in `performance_summary`
  (visible in Pipeline). **Gap:** fallback not surfaced in the Campaigns confirmation message.
- Generated `content_items` appear in Pipeline (status idea/brief; `revalidatePath`). **OK.**
- No live publishing (`approval_status: not_requested`, no scheduling/posting). **Confirmed.**

## 761c235 — Add campaign internal agent orchestrator

Files: `app/api/marketing/campaigns/[id]/orchestrate/route.ts`, `components/os/pipeline-workspace.tsx`.

- Internal chain: content/SEO draft → Crina draft review → visual direction → Crina final
  review → human gate. `workflow_stage`/visual columns/enums all valid against schema.
- No live publishing; final review explicitly never approves for the human. **Confirmed.**
- Ownership persisted (`workflow_stage`, `current_owner`, `next_owner`, handoff/notes). **OK.**
- Brand-scoped record-level; same brain leak (issue #3).
- **Risks at the time (now partly addressed in df37ae0/4830ead):** original 12-step/4-round
  single request → timeout risk; stuck-state where any item reaching the human gate disabled
  the campaign-wide Continue button while siblings still had work; no per-item rework cap
  (issue #4); silent persist mismatch (issue #6); fallback review always "approve".

## df37ae0 — Automate campaign agent workflow batches

Files: `automation/start/route.ts` (new), `automation/tick/route.ts` (new),
`orchestrate/route.ts`, `campaign-workspace.tsx`, `pipeline-workspace.tsx`.

- Removes manual internal buttons (Send/Move/Continue); approval → `automation/start`
  (execute + first tick); Pipeline auto-ticks via `useEffect`. **OK.**
- Batch reduced 12→3 steps / 4→2 rounds → better timeout profile. **Note:** `start` =
  execute (1 call) + tick (≤3) ≈ up to 4 sequential model calls/request; still non-trivial.
- Stops at human_approval/publishing; no live publishing. **Confirmed.**
- **Bug found (fixed in 4830ead):** hard `autoRuns >= 8` cap silently stalled 5–7 item
  campaigns before the gate, with a misleading green "Auto" badge and recovery only via
  Pause→Resume.

## 4830ead — Make pipeline automation progress aware

File: `components/os/pipeline-workspace.tsx`. Resolves the df37ae0 stall bug. No crash bug.

- Hard 8-tick cap replaced by `noProgressCounts` (resets to 0 on any advance); 3 consecutive
  no-progress ticks or an error → `attentionIds` ("Needs attention", recoverable via Resume).
- `advanced` counts `advanced` + `fallback` (correct — fallback persists a stage move).
- Auto-ticks all runnable campaigns (not just selected); `orchestratingId` serializes one
  tick at a time per client. Effect now depends on memoized `executions` (fresher).
- No manual task buttons; still stops at human/publishing. **Confirmed.**
- **Remaining:** issues #1, #2, #5, #7 above.
