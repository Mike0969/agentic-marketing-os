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
// Same shape with a reset time in the future, so the breaker is still active when the next call is made.
const FUTURE_RESET = Math.floor(Date.now() / 1000) + 3600;
const LIVE_LIMIT_TEXT = LIMIT_TEXT.replace("1795164815", String(FUTURE_RESET));
const hhmm = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 16);

function seed(row: Record<string, unknown> = {}, calls: Array<Record<string, unknown>> = []) {
  const db = new FakeSupabase({ tables: { model_budget: [{ id: 1, per_campaign_max: 40, per_day_max: 150, per_day_usd: 2, per_campaign_usd: 0.5, hermes_blocked_until: null, ...row }], model_calls: calls, model_prices: [], agent_config: [], agent_settings: [] } });
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
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: LIVE_LIMIT_TEXT } }] }));
  const first = await withEnv(ENV, call, hermes.fn);
  assert.equal(first.ok, false);
  assert.equal(first.rateLimited, true);
  assert.equal(first.error, `Hermes limit reached, resets at ${hhmm(FUTURE_RESET)} UTC.`);
  assert.equal(db.rows("model_budget")[0].hermes_blocked_until, new Date(FUTURE_RESET * 1000).toISOString());

  const second = await withEnv(ENV, call, hermes.fn);
  assert.equal(second.error, `Hermes limit reached, resets at ${hhmm(FUTURE_RESET)} UTC.`);
  assert.equal(hermes.calls.length, 1, "no second request to Hermes while the limit is active");
});

test("an HTTP 429 from Hermes trips the breaker too", async () => {
  seed();
  const hermes = fakeFetch(() => new Response("Too Many Requests 'resets_in_sec': 60", { status: 429 }));
  const result = await withEnv(ENV, call, hermes.fn);
  assert.equal(result.rateLimited, true);
  assert.match(result.error!, /^Hermes limit reached, resets at \d\d:\d\d UTC\.$/);
});

test("a fallback answer that only mentions a limit is not a failure: no trip", async () => {
  const db = seed();
  const prose = "The primary model hit a rate limit earlier, so here is the brief from the fallback model without JSON.";
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: prose } }] }));
  const result = await withEnv(ENV, call, hermes.fn);
  assert.equal(result.ok, false, "still not usable JSON");
  assert.notEqual(result.rateLimited, true);
  assert.match(result.error!, /^Hermes answered without JSON/);
  assert.equal(db.rows("model_budget")[0].hermes_blocked_until, null, "breaker untouched");
  const ok = await withEnv(ENV, call, fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"summary":"from DeepSeek"}' } }] })).fn);
  assert.equal(ok.ok, true);
});

test("daily $ cap: each call records its model, tokens and cost; at the cap the next call is refused before Hermes", async () => {
  const db = seed({ per_day_usd: 0.01 });
  db.tables.model_prices = [{ provider: "hermes", model: "*", usd_per_m_in: 1000, usd_per_m_out: 0, usd_per_call: 0, verified: true, note: "" }];
  await budget.listModelPrices(true);
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"summary":"ok"}' } }], usage: { prompt_tokens: 20, completion_tokens: 5 } }));
  const ok = await withEnv(ENV, call, hermes.fn);
  assert.equal(ok.ok, true);
  const row = db.rows("model_calls")[0];
  assert.equal(row.tokens_in, 20);
  assert.equal(row.tokens_out, 5);
  assert.ok(Math.abs(Number(row.cost_usd) - 0.02) < 1e-9);
  const refused = await withEnv(ENV, call, hermes.fn);
  assert.equal(refused.ok, false);
  assert.match(refused.error!, /Today's model budget cap \(\$0\.010\) is used up/);
  assert.equal(hermes.calls.length, 1);
});

test("campaign $ cap and preflight: a step that could go over the dollars left is refused up front, in plain words", async () => {
  const today = new Date().toISOString();
  const db = seed({ per_campaign_usd: 0.5, per_day_usd: 2 }, [{ id: 1, at: today, kind: "openai", campaign_id: "c1", cost_usd: 0.45 }]);
  db.tables.model_prices = [{ provider: "*", model: "*", usd_per_m_in: 0, usd_per_m_out: 0, usd_per_call: 0.02, verified: false, note: "" }, { provider: "hermes", model: "*", usd_per_m_in: 0, usd_per_m_out: 0, usd_per_call: 0.02, verified: false, note: "" }];
  await budget.listModelPrices(true);
  await withEnv(ENV, async () => {
    assert.equal(await budget.preflight("c1", [{ agentId: "agent-seo", calls: 2 }]), null); // $0.04 <= $0.05 left
    assert.match((await budget.preflight("c1", [{ agentId: "agent-seo", calls: 3 }]))!, /this campaign has \$0\.050 of its \$0\.50 cap left and this step may cost up to \$0\.060/);
    assert.match((await budget.preflight(null, [{ agentId: "agent-seo", calls: 100 }]))!, /only \$1\.55 of today's \$2\.00 cap is left/);
    const status = await budget.getBudgetStatus("c1");
    assert.ok(Math.abs(status!.remainingUsdCampaign! - 0.05) < 1e-9);
  });
});

test("no limit (the default): nothing is refused, everything is still counted", async () => {
  const today = new Date().toISOString();
  const db = seed({ per_day_usd: null, per_campaign_usd: null }, [{ id: 1, at: today, kind: "openai", campaign_id: "c1", cost_usd: 999 }]);
  db.tables.model_prices = [{ provider: "*", model: "*", usd_per_m_in: 0, usd_per_m_out: 0, usd_per_call: 5, verified: false, note: "" }];
  await budget.listModelPrices(true);
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"summary":"ok"}' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }));
  await withEnv(ENV, async () => {
    assert.equal(await budget.preflight("c1", [{ agentId: "agent-seo", calls: 1000 }]), null);
    const status = await budget.getBudgetStatus("c1");
    assert.equal(status!.perDayUsd, null);
    assert.equal(status!.remainingUsdCampaign, null);
    assert.equal(status!.usdCampaign, 999);
  });
  const ok = await withEnv(ENV, () => budget.withCampaignBudget("c1", call), hermes.fn);
  assert.equal(ok.ok, true);
  assert.equal(db.rows("model_calls").length, 2);
});

test("prices: exact model, then the provider's *, then */*; cost = per call + tokens x price", () => {
  const rows = [
    { provider: "openai", model: "gpt-5-mini", usd_per_m_in: 0.25, usd_per_m_out: 2, usd_per_call: 0, verified: false, note: "" },
    { provider: "openai", model: "*", usd_per_m_in: 1.25, usd_per_m_out: 10, usd_per_call: 0, verified: false, note: "" },
    { provider: "hermes", model: "*", usd_per_m_in: 0, usd_per_m_out: 0, usd_per_call: 0, verified: true, note: "" },
    { provider: "*", model: "*", usd_per_m_in: 9, usd_per_m_out: 9, usd_per_call: 0, verified: false, note: "" }
  ];
  assert.equal(budget.pickPrice(rows, "openai", "gpt-5-mini").usd_per_m_in, 0.25);
  assert.equal(budget.pickPrice(rows, "OpenAI", "gpt-6.2-sol").usd_per_m_in, 1.25);
  assert.equal(budget.pickPrice(rows, "glm", "glm-5.2").usd_per_m_in, 9);
  assert.equal(budget.costOf(budget.pickPrice(rows, "hermes", "crina"), 40000, 1000), 0);
  assert.ok(Math.abs(budget.costOf(budget.pickPrice(rows, "openai", "gpt-5-mini"), 8000, 1000) - 0.004) < 1e-12);
});

test("preflight says the Hermes limit while it is active", async () => {
  seed({ hermes_blocked_until: new Date(Date.now() + 3600_000).toISOString() });
  await withEnv(ENV, async () => {
    assert.match((await budget.preflight(null, [{ agentId: "agent-seo", calls: 1 }]))!, /^Hermes limit reached, resets at/);
  });
});

test("calls inside withCampaignBudget are charged to that campaign", async () => {
  const db = seed();
  const hermes = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"summary":"ok"}' } }] }));
  await withEnv(ENV, () => budget.withCampaignBudget("c9", call), hermes.fn);
  assert.equal(db.rows("model_calls")[0].campaign_id, "c9");
});
