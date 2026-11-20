// the admin's simple flow: learning vault, Jev gate, flow stages, the new-campaign and review routes. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const { diskStorage, recordLearning, learningContext, listLearningNotes, defaultVault } = await import("../lib/learning/vault.ts");
const { jevCheck, jevLoop, JEV_PASS } = await import("../lib/jev/jev.ts");
const { flowView } = await import("../lib/marketing/flow-view.ts");
const newRoute = await import("../app/api/marketing/campaigns/new/route.ts");
const reviewRoute = await import("../app/api/marketing/content-items/[id]/review/route.ts");

const ADMIN = "admin@example.com";
const BRAND = "44444444-4444-4444-8444-444444444444";

// ---------- learning vault ----------

test("vault: a Rework and a Yes become markdown notes the agents read back", async () => {
  const storage = diskStorage(mkdtempSync(path.join(tmpdir(), "vault-")));
  await recordLearning(storage, { kind: "rejected", part: "text", campaign: "Zero commission", platform: "LinkedIn", agent: "Content Creator Agent", reason: "Too generic, say who keeps the fare", item: "Rides are changing." });
  await recordLearning(storage, { kind: "approved", part: "text", campaign: "Zero commission", platform: "LinkedIn", agent: "Content Creator Agent", reason: "", item: "Drivers keep 100% of the fare." });
  const notes = await listLearningNotes(storage);
  assert.equal(notes.length, 2);
  const rejected = notes.find((note) => note.kind === "rejected")!;
  assert.equal(rejected.reason, "Too generic, say who keeps the fare");
  assert.equal(rejected.item, "Rides are changing.");
  const index = await storage.read("index.md");
  assert.match(index!, /\[\[rejected\//);
  assert.match(index!, /not model training/);
  const context = await learningContext(storage, { part: "text" });
  assert.match(context.text, /Don't repeat:\n- \[text\] Too generic, say who keeps the fare/);
  assert.match(context.text, /Good examples:\n- \[text\] "Drivers keep 100% of the fare\."/);
  assert.equal((await learningContext(storage, { part: "visual" })).dontRepeat.length, 0);
});

test("vault: paths cannot escape the root; no storage -> no-op", async () => {
  const storage = diskStorage(mkdtempSync(path.join(tmpdir(), "vault-")));
  await assert.rejects(storage.write("../outside.md", "x"));
  assert.equal(await recordLearning(null, { kind: "approved", part: "text", campaign: "c", platform: "p", agent: "a", reason: "", item: "i" }), null);
});

// ---------- Jev ----------

const fakeJev = (scores: Record<string, number>[]) => {
  let call = 0;
  return { systemOne: async () => ({ answers: Object.fromEntries(Object.entries(scores[Math.min(call++, scores.length - 1)]).map(([k, v]) => [k, { noul: v }])), model: "jev-test" }) };
};
const all = (value: number) => ({ owner_idea: value, platform_fit: value, brand_rules: value, no_repeat: value, no_invented: value });

test("jev: the score is the lowest answer; below 0.85 names the failing question", async () => {
  const pass = await jevCheck({ kind: "text", idea: "i", brand: null, learning: "", subject: "post" }, fakeJev([all(0.95)]));
  assert.equal(pass.pass, true);
  assert.equal(pass.score, 0.95);
  const fail = await jevCheck({ kind: "text", idea: "i", brand: null, learning: "", subject: "post" }, fakeJev([{ ...all(0.95), no_invented: 0.4 }]));
  assert.equal(fail.pass, false);
  assert.equal(fail.score, 0.4);
  assert.equal(fail.doubts.length, 1);
  assert.match(fail.doubts[0], /claim that the given material does not support \(0\.40\)/);
  assert.ok(JEV_PASS === 0.85);
});

test("jev: no key -> not run, not blocking", async () => {
  const result = await jevCheck({ kind: "plan", idea: "i", brand: null, learning: "", subject: {} }, null);
  assert.equal(result.ran, false);
  assert.equal(result.pass, true);
  assert.match(result.note!, /TYPESAFE_API_KEY missing/);
});

test("jev loop: automatic rework at most 2 rounds, then 'Jev doubts: …' for the admin", async () => {
  const client = fakeJev([{ ...all(0.9), brand_rules: 0.3 }]);
  const reworkInputs: string[][] = [];
  const out = await jevLoop<string>(
    "v1",
    (candidate) => jevCheck({ kind: "text", idea: "i", brand: null, learning: "", subject: candidate }, client),
    async (candidate, doubts) => {
      reworkInputs.push(doubts);
      return `${candidate}+`;
    }
  );
  assert.equal(out.reworks, 2);
  assert.equal(out.candidate, "v1++");
  assert.match(out.doubtsLabel!, /^Jev doubts: Breaks or ignores at least one stated brand rule/);
  assert.equal(reworkInputs.length, 2);

  const second = fakeJev([{ ...all(0.9), no_repeat: 0.2 }, all(0.9)]);
  const fixed = await jevLoop<string>("v1", (c) => jevCheck({ kind: "text", idea: "i", brand: null, learning: "", subject: c }, second), async (c) => `${c}+`);
  assert.equal(fixed.reworks, 1);
  assert.equal(fixed.doubtsLabel, null);
});

// ---------- flow stages ----------

test("flow view: stage and who it waits for", () => {
  const campaign = (stage: string) => ({ id: "c1", idea_brief: { flow: "simple", stage, plan_jev: { doubts: "Jev doubts: x" } } }) as never;
  assert.equal(flowView(campaign("plan_doubts"), []).needsApproval, true);
  assert.equal(flowView(campaign("plan_doubts"), []).step, 2);
  assert.equal(flowView(campaign("agents"), []).label, "Agents working");
  const pending = [{ campaign_id: "c1", approval_status: "pending" }] as never;
  assert.equal(flowView(campaign("agents"), pending).step, 4);
  const approved = [{ campaign_id: "c1", approval_status: "approved" }] as never;
  assert.equal(flowView(campaign("agents"), approved).step, 5);
  const blocked = { id: "c1", idea_brief: { flow: "simple", stage: "agents", blocked: { reason: "Blocked by safety check: brand details are still placeholder (score 26/100). Fill in Brands → NexRide." } } } as never;
  assert.equal(flowView(blocked, []).needsApproval, true);
  assert.match(flowView(blocked, []).label, /^Blocked by safety check/);
  assert.equal(flowView(blocked, pending).step, 4, "a post waiting for review wins over an older block");
});

// ---------- routes ----------

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  const db = new FakeSupabase({
    tables: {
      brands: [{ id: BRAND, name: "NexRide", active: true, positioning: "Zero-commission EV rides", target_audience: "Dubai drivers", approval_rules: "Human approves every post." }],
      campaigns: [],
      content_items: [],
      approvals: [],
      feedback_memory: [],
      activity: [],
      agent_runs: [],
      agent_config: [],
      agent_settings: [],
      ...extra
    }
  });
  db.user = { email: ADMIN };
  holder.db = db;
  return db;
}

const hermesPlan = fakeFetch(() =>
  jsonResponse({
    choices: [{ message: { content: JSON.stringify({ title: "Keep the whole fare", objective: "Show drivers they keep the fare", target_audience: "Dubai drivers", key_message: "Zero commission", platforms: ["linkedin", "myspace"], cta: "Drive with NexRide", success_criteria: "Driver sign-ups", agent_tasks: { content: "a", visual: "b", seo: "c", analytics: "d" }, summary: "Two sentences." }) } }]
  })
);

test("new campaign: one idea -> campaign + a template plan from the brand (no model call)", async () => {
  const db = seed();
  const hermes = fakeFetch(() => jsonResponse({ error: "no model call expected" }, 500));
  const res = await withEnv(
    { ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN, HERMES_AGENT_ENDPOINT: "http://hermes.test/v1/chat/completions", TYPESAFE_API_KEY: undefined },
    () => newRoute.POST(new Request("https://os.example/api/marketing/campaigns/new", { method: "POST", body: JSON.stringify({ idea: "Show drivers in Dubai they keep the whole fare.", platforms: ["LinkedIn", "Myspace"] }) })),
    hermes.fn
  );
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.stage, "plan_ready");
  assert.deepEqual(body.plan.platforms, ["LinkedIn"], "unknown platforms dropped");
  assert.equal(hermes.calls.length, 0, "the plan is templated: no model call");
  const campaign = db.rows("campaigns")[0];
  assert.equal(campaign.title, "Show drivers in Dubai they keep the whole");
  assert.equal((campaign.idea_brief as Record<string, unknown>).flow, "simple");
});

test("new campaign: an empty idea is refused", async () => {
  seed();
  const res = await withEnv({ ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN }, () => newRoute.POST(new Request("https://os.example/x", { method: "POST", body: JSON.stringify({ idea: "hi" }) })));
  assert.equal(res.status, 400);
});

const ITEM = { id: "i1", brand_id: BRAND, campaign_id: "c1", title: "Keep the fare", hook: "Hook", body: "Body", CTA: "Drive", platform: "LinkedIn", content_type: "Social post", status: "approval", approval_status: "pending", workflow_stage: "human_final_approval", scheduled_at: null, archived_at: null, ready_package: { text: "Body", assets: [{ kind: "image", prompt: "Driver at night", status: "placeholder" }] } };

const review = (body: Record<string, unknown>) =>
  reviewRoute.POST(new Request("https://os.example/api/marketing/content-items/i1/review", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "i1" }) });

test("review: Yes on both -> final approval (scheduled) and two good-example notes", async () => {
  const db = seed({ content_items: [{ ...ITEM }], campaigns: [{ id: "c1", brand_id: BRAND, title: "Keep the fare", idea_brief: { flow: "simple" } }] });
  const brainRoot = mkdtempSync(path.join(tmpdir(), "brain-"));
  const res = await withEnv({ ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN, HERMES_WRITABLE_BRAIN_PATH: brainRoot, SOCIAL_POSTING_ENABLED: undefined }, () => review({ text: { decision: "yes" }, visual: { decision: "yes" } }));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.outcome, "approved");
  assert.equal(db.rows("content_items")[0].status, "scheduled");
  const approvedDir = path.join(brainRoot, "projects", "gulf-el-nexride", "learning", "approved");
  assert.equal(readdirSync(approvedDir).length, 2);
  const notes = await listLearningNotes(defaultVault("NexRide"));
  assert.equal(notes.length, 0, "defaultVault reads the env at call time; outside withEnv nothing is configured");
  assert.match(readFileSync(path.join(approvedDir, readdirSync(approvedDir)[0]), "utf8"), /The approver said Yes/);
});

test("review: Rework without a reason or no choice at all is refused; one decided part is saved and the other stays waiting", async () => {
  const db = seed({ content_items: [{ ...ITEM }] });
  const env = { ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN };
  assert.equal((await withEnv(env, () => review({ text: { decision: "rework" }, visual: { decision: "yes" } }))).status, 400);
  assert.equal((await withEnv(env, () => review({}))).status, 400);
  assert.equal((await withEnv(env, () => review({ text: { decision: null, reason: "" }, visual: { decision: null, reason: "" } }))).status, 400);
  const partial = await withEnv(env, () => review({ text: { decision: null, reason: "" }, visual: { decision: "yes" } }));
  assert.equal(partial.status, 200);
  const body = (await partial.json()) as { outcome: string; message: string };
  assert.equal(body.outcome, "partial");
  assert.match(body.message, /Choose Yes or Rework for Text/);
  assert.equal(db.rows("content_items")[0].approval_status, "pending");
});

test("review: a post that is not waiting for review is refused", async () => {
  seed({ content_items: [{ ...ITEM, approval_status: "approved" }] });
  const res = await withEnv({ ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN }, () => review({ text: { decision: "yes" }, visual: { decision: "yes" } }));
  assert.equal(res.status, 409);
});
