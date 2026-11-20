import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLine } from "../lib/marketing/status-line.ts";
import { runOutcome } from "../lib/marketing/campaign-jobs.ts";

const now = Date.parse("2026-11-20T12:45:00Z");
const job = (state: string, extra: Record<string, unknown> = {}) => ({ id: "j", kind: "run", label: "Rework with your note", state, started_at: "2026-11-20T12:41:00Z", finished_at: null, summary: null, seen_at: null, ...extra }) as never;
const post = (approval_status: string, extra: Record<string, unknown> = {}) => ({ approval_status, workflow_stage: "human_final_approval", platform: "Instagram", scheduled_at: null, published_at: null, ...extra }) as never;

test("status line: one plain sentence + time, and what Mihai can do", () => {
  const working = statusLine({ idea_brief: { stage: "agents" } } as never, [], job("running"), now);
  assert.equal(working.tone, "working");
  assert.match(working.text, /^Agents working: rework with your note\. You can leave this page/);
  assert.equal(working.at, "started 12:41 UTC");

  const doubts = statusLine({ idea_brief: { stage: "plan_doubts", plan_jev: { score: 0.26 } } } as never, [], null, now);
  assert.equal(doubts.text, "Stopped: Jev rejected the plan (0.26). Needs you: approve the plan anyway, or rework it with your note.");
  assert.deepEqual(doubts.actions, ["approve_plan", "rework_plan"]);

  const ready = statusLine({ idea_brief: { stage: "agents" } } as never, [post("pending")], job("ready", { finished_at: "2026-11-20T12:39:00Z" }), now);
  assert.match(ready.text, /^Ready for your review: 1 post\(s\) \(Instagram\)/);

  const blocked = statusLine({ idea_brief: { stage: "agents", blocked: { kind: "safety", reason: "x", platform: "Instagram", at: "2026-11-20T12:30:00Z" } } } as never, [], null, now);
  assert.match(blocked.text, /^Blocked by safety check \(Instagram\)\. Needs you/);

  const scheduled = statusLine({ idea_brief: { stage: "agents" } } as never, [post("approved")], null, now);
  assert.equal(scheduled.text, "Scheduled: all posts approved.");

  // A "running" job older than 20 min is not shown as working (the cron ends it).
  const stale = statusLine({ idea_brief: { stage: "agents" } } as never, [], job("running", { started_at: "2026-11-20T12:00:00Z" }), now);
  assert.notEqual(stale.tone, "working");
});

test("job outcome lines for the Telegram/Slack alert", () => {
  assert.deepEqual(runOutcome(429, { error: "Model budget: …" }), { state: "error", summary: "Model budget: …" });
  assert.equal(runOutcome(200, { posts: [{ platform: "Instagram", title: "Where NexRide Fits" }] }).summary, 'ready for your review: Instagram "Where NexRide Fits".');
  assert.equal(runOutcome(200, { posts: [{ platform: "Instagram", title: "x", blocked: true, stop: "safety" }] }).state, "blocked");
  assert.equal(runOutcome(200, { posts: [{ platform: "Instagram", title: "x", blocked: true, stop: "error" }] }).state, "error");
  assert.equal(runOutcome(200, { posts: [] }).state, "error");
});
