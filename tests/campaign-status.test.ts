import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLine } from "../lib/marketing/status-line.ts";
import { runOutcome } from "../lib/marketing/campaign-jobs.ts";

const now = Date.parse("2026-11-20T12:45:00Z");
const job = (state: string, extra: Record<string, unknown> = {}) => ({ id: "j", kind: "run", label: "Rework with your note", state, started_at: "2026-11-20T12:41:00Z", finished_at: null, summary: null, seen_at: null, ...extra }) as never;
const post = (approval_status: string, extra: Record<string, unknown> = {}) => ({ approval_status, workflow_stage: "human_final_approval", platform: "Instagram", scheduled_at: null, published_at: null, ...extra }) as never;

test("status line: one plain sentence + time, and what the admin can do", () => {
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

test("brand analysis keeps only new text for known fields (lists joined one per line)", async () => {
  const { usefulProposals } = await import("../lib/marketing/brand-analysis.ts");
  const out = usefulProposals(
    { positioning: "Same text", tone_of_voice: "old" },
    { positioning: "Same text", tone_of_voice: "Bold, clear", pillars: ["Community", "Mobility"], website: "x", unknown_field: "y", offers: "  " }
  );
  assert.deepEqual(out, [{ field: "tone_of_voice", value: "Bold, clear", sources: [] }, { field: "pillars", value: "Community\nMobility", sources: [] }]);
  const withSources = usefulProposals({}, { offers: { value: "Fleet shares", sources: ["W1", "L2"] } });
  assert.deepEqual(withSources, [{ field: "offers", value: "Fleet shares", sources: ["W1", "L2"] }]);
});

test("site reader: text, same-site links only (subdomains included), robots rules for *", async () => {
  const { extractPage, robotsDisallows, siteOf } = await import("../lib/marketing/site-reader.ts");
  assert.equal(siteOf("https://www.gulf-el.com/x"), "gulf-el.com");
  const dom = '<html><head><title>Gulf-EL</title><script>var x=1</script></head><body><h1>Own a fleet</h1><a href="./nexride/">N</a><a href="https://investor-portal.gulf-el.com">P</a><a href="https://evil.com/">E</a><a href="/a.pdf">pdf</a><a href="mailto:x@y.z">m</a></body></html>';
  const page = extractPage(dom, "https://www.gulf-el.com/", "gulf-el.com");
  assert.equal(page.title, "Gulf-EL");
  assert.match(page.text, /Own a fleet/);
  assert.ok(!page.text.includes("var x"));
  assert.deepEqual(page.links.sort(), ["https://investor-portal.gulf-el.com/", "https://www.gulf-el.com/nexride/"]);
  assert.deepEqual(robotsDisallows("User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\n"), []);
  assert.deepEqual(robotsDisallows("User-agent: *\nDisallow: /admin\n"), ["/admin"]);
});

test("template plan: from the brand + templates, no model; his note goes to the writer", async () => {
  const { templatePlan } = await import("../lib/marketing/simple-flow.ts");
  const brand = { name: "Gulf-EL.com / NexRide", target_audience: "Investors and community members", key_messages: "- Fleet-led mobility\n- Community first", positioning: "x", ctas: "Follow Gulf-EL / NexRide\nVisit the site", seo_targets: "Gulf-EL mobility, NexRide, GCC EV", tpl_hashtags: "#NexRide #GulfEL", tpl_measure: "Followers gained\nLikes per post", tpl_success_criteria: "More followers" } as never;
  const p = templatePlan({ idea: "Grow our Instagram followers this week. Show the community.", brand, platforms: [], note: "leave the drivers aside" });
  assert.equal(p.title, "Grow our Instagram followers this week");
  assert.deepEqual(p.platforms, ["Instagram"]);
  assert.equal(p.key_message, "Fleet-led mobility");
  assert.equal(p.cta, "Follow Gulf-EL / NexRide");
  assert.deepEqual(p.hashtags, ["#NexRide", "#GulfEL"]);
  assert.deepEqual(p.measure, ["Followers gained", "Likes per post"]);
  assert.equal(p.success_criteria, "More followers");
  assert.match(p.agent_tasks.content, /leave the drivers aside/);
});
