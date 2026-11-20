// Hard model-call budget + Hermes usage-limit breaker. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const budget = await import("../lib/budget/model-budget.ts");
const { runHermesAgent } = await import("../lib/agents/hermes-client.ts");

const ENDPOINT = "http://hermes.test/p/crina/v1/chat/completions";
const ENV = { ...SUPABASE_ENV, HERMES_AGENT_ENDPOINT: ENDPOINT, HERMES_AGENT_BACKUP_MODEL: undefined };
const LIMIT_TEXT = "API call failed after 3 retries. HTTP 429: Error code: 429 - {'error': {'type': 'usage_limit_reached', 'message': 'The usage limit has been reached', 'resets_at': 1795164815}}";

function seed(row: Record<string, unknown> = {}, calls: Array<Record<string, unknown>> = []) {
  const db = new FakeSupabase({ tables: { model_budget: [{ id: 1, per_campaign_max: 40, per_day_max: 150, hermes_blocked_until: null, ...row }], model_calls: calls, agent_config: [], agent_settings: [] } });
  holder.db = db;
  return db;
}

const call = () => runHermesAgent({ agentId: "agent-seo", fallbackAgentName: "SEO", task: "t", outputSchema: { summary: "s" }, input: {} });

test("reset time: resets_at, resets_in_sec, else one hour; usage-limit text is recognised", () => {
  assert.equal(budget.parseResetAt(LIMIT_TEXT), "2026-11-20T08:53:35.000Z");
  assert.equal(budget.parseResetAt("'resets_in_sec': 600", Date.UTC(2026, 10, 20, 6, 0, 0)), "2026-11-20T06:10:00.000Z");
  assert.equal(budget.parseResetAt("nothing", Date.UTC(2026, 10, 20, 6, 0, 0)), "2026-11-20T07:00:00.000Z");
  assert.equal(budget.limitMessage("2026-11-20T08:53:35.000Z"), "Hermes limit reached, resets at 08:53 UTC.");
  assert.ok(budget.isUsageLimit(LIMIT_TEXT));
  assert.ok(!budget.isUsageLimit('{"summary":"fine"}'));
});

test("Hermes 429 text (HTTP 200) trips the breaker; the next call is refused without reaching Hermes", async () => {
  const db = seed();
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: LIMIT_TEXT } }] }));
  const first = await withEnv(ENV, call, hermes.fn);
  assert.equal(first.ok, false);
  assert.equal(first.rateLimited, true);
  assert.equal(first.error, "Hermes limit reached, resets at 08:53 UTC.");
  assert.equal(db.rows("model_budget")[0].hermes_blocked_until, "2026-11-20T08:53:35.000Z");

  const second = await withEnv(ENV, call, hermes.fn);
  assert.equal(second.error, "Hermes limit reached, resets at 08:53 UTC.");
  assert.equal(hermes.calls.length, 1, "no second request to Hermes while the limit is active");
});

test("an HTTP 429 from Hermes trips the breaker too", async () => {
  seed();
  const hermes = fakeFetch(() => new Response("Too Many Requests 'resets_in_sec': 60", { status: 429 }));
  const result = await withEnv(ENV, call, hermes.fn);
  assert.equal(result.rateLimited, true);
  assert.match(result.error!, /^Hermes limit reached, resets at \d\d:\d\d UTC\.$/);
});

test("daily cap: calls are charged; at the cap the call is refused before Hermes", async () => {
  const today = new Date().toISOString();
  const db = seed({ per_day_max: 2 }, [{ id: 1, at: today, kind: "hermes" }]);
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"summary":"ok"}' } }] }));
  const ok = await withEnv(ENV, call, hermes.fn);
  assert.equal(ok.ok, true);
  assert.equal(db.rows("model_calls").length, 2);
  const refused = await withEnv(ENV, call, hermes.fn);
  assert.equal(refused.ok, false);
  assert.match(refused.error!, /budget for today is used up \(2\)/);
  assert.equal(hermes.calls.length, 1);
});

test("campaign cap and preflight: a run that could exceed the budget is refused up front", async () => {
  const today = new Date().toISOString();
  seed({ per_campaign_max: 10 }, Array.from({ length: 8 }, (_, i) => ({ id: i + 1, at: today, kind: "hermes", campaign_id: "c1" })));
  await withEnv(ENV, async () => {
    assert.equal(await budget.preflight("c1", 2), null);
    assert.match((await budget.preflight("c1", 3))!, /this campaign has 2 of 10 calls left/);
    assert.match((await budget.preflight(null, 200))!, /only 142 of 150 are left today/);
    const status = await budget.getBudgetStatus("c1");
    assert.equal(status!.remainingCampaign, 2);
  });
});

test("preflight says the Hermes limit while it is active", async () => {
  seed({ hermes_blocked_until: new Date(Date.now() + 3600_000).toISOString() });
  await withEnv(ENV, async () => {
    assert.match((await budget.preflight(null, 1))!, /^Hermes limit reached, resets at/);
  });
});

test("calls inside withCampaignBudget are charged to that campaign", async () => {
  const db = seed();
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"summary":"ok"}' } }] }));
  await withEnv(ENV, () => budget.withCampaignBudget("c9", call), hermes.fn);
  assert.equal(db.rows("model_calls")[0].campaign_id, "c9");
});
