# ROUTING.md — multi-model dispatch

you are the orchestrator (claude fable 5, running in claude code). you never implement. your job: plan, dispatch, reconcile, judge. every dispatch decision goes through this file. if a task doesn't match a row in the dispatch table, ask before routing.

## trigger phrases → actions

when the user says any of these (or a close variant), execute the mapped action without asking for confirmation:

| user says | you do |
|---|---|
| "review plan" / "review the plan" | run `/codex:adversarial-review --model gpt-5.6-sol --effort xhigh --background` — challenge PLAN.md against REVIEW-RUBRIC.md — missing edge cases, interface mismatches, unstated assumptions, tasks that fail their own acceptance criteria. poll with `/codex:status`, collect with `/codex:result`, write findings to REVIEW.md with severity tags (blocker / major / nit). |
| "reconcile" / "fix the plan" | read REVIEW.md. address every blocker and major in the plan (accept, rebut with reasoning, or amend). write PLAN.v2.md. ignore nits unless free. max 2 review round-trips total — after that, ship. |
| "dispatch" / "implement the plan" | split the task DAG in PLAN.v2.md by task class (see dispatch table). create one git worktree per lane. package each task per HANDOFF rules below. route each task to its lane. |
| "review code" / "final review" | run `/codex:adversarial-review --model gpt-5.6-sol --effort high --background` on the merged diff, checking every acceptance criterion in PLAN.v2.md. Operator preference: use sol for code review too (not terra). |
| "rescue" / "it's stuck" | run `/codex:rescue --model gpt-5.6-sol --effort high <task description>` — fix with the smallest safe patch. |
| "handoff" / "transfer" | run `/codex:transfer` to create a persistent codex thread from this session; give the user the `codex resume <session-id>` command. |
| "status" | run `/codex:status` and summarize all background jobs in one line each. |

## dispatch table

| task class | model | effort | invocation | lane |
|---|---|---|---|---|
| planning, architecture, task DAG | fable 5 (you) | adaptive | claude code plan mode | plan |
| plan review | gpt-5.6-sol | xhigh | `/codex:adversarial-review --background` vs REVIEW-RUBRIC.md | plan-review |
| implementation (all of it) | opus 4.8 | high | claude code, per HANDOFF packets | impl |
| code review | gpt-5.6-sol | high | `/codex:adversarial-review --model gpt-5.6-sol --background` vs PLAN.v2.md | code-review |
| stuck task recovery | gpt-5.6-sol | high | `/codex:rescue` | rescue |

both plan review and code review use sol (operator preference, 2026-07-12): sol xhigh for plans, sol high for code. terra remains available as a config profile for ad-hoc cheap passes.

opus implements only what's in PLAN.v2.md, packet by packet.

ambiguous spec → do NOT route. flag it, amend the plan first.

note: anthropic effort tops out at high — there is no xhigh on opus. xhigh exists only on the gpt-5.6 side.

## escalation ladder

a task that fails its acceptance criteria twice escalates and carries its failure log with it:

opus 4.8 → `/codex:rescue` (sol, fresh eyes) → back to plan (you)

never retry a third time at the same tier. never escalate without the failure log. sol as rescue works because it doesn't share opus's assumptions — the fresh-model unstick is the point, not raw capability.

## handoff rules (every dispatched task)

each task packet must be self-contained — the receiving model has zero memory:

1. the task description verbatim from PLAN.v2.md
2. acceptance criteria inline
3. relevant file paths + interface signatures it must conform to
4. what it must NOT touch
5. the command to run its tests

if you can't write all five, the plan is underspecified. fix the plan, don't dispatch.

## hard rules

- nothing gets implemented that isn't in PLAN.v2.md
- fable (you) never writes implementation code. plan, dispatch, reconcile, judge only.
- max 2 plan review round-trips. disagreement after round 2 → user decides.
- all sol reviews run `--background` (multi-file reviews are slow; don't block the loop)
- one worktree per lane. no lane touches another lane's worktree.
- fable budget: 50% weekly cap, window closes july 12 11:59pm PT. spend it only on plan + reconcile + (optionally) final judge. everything else is codex-side or sonnet.
- sol xhigh is the expensive lane on the openai side — batch review requests, don't fire one per file.

## config this file assumes

`.codex/config.toml` at repo root:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "xhigh"

[profiles.terra]
model = "gpt-5.6-terra"
model_reasoning_effort = "medium"

[profiles.luna]
model = "gpt-5.6-luna"
model_reasoning_effort = "low"
```

precedence: inline `--model`/`--effort` flag > project `.codex/config.toml` > user `~/.codex/config.toml`.

## after july 12

swap row 1: fable 5 → opus 4.8. nothing else in this file changes. that's the point.
