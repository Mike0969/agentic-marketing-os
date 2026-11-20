// Agents board Run: each agent does its real job through Hermes; Publishing only prepares;
// an agent missing a provider key ends "needs_key", never "error". No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const run = await import("../app/api/os/agents/[agentId]/run/route.ts");
const { boardTasks } = await import("../lib/agents/board-tasks.ts");
const { registeredAgents } = await import("../lib/agents/registry.ts");

const ADMIN = "admin@example.com";
const ENDPOINT = "http://hermes.test/p/crina/v1/chat/completions";
const ENV = {
  ...SUPABASE_ENV,
  ADMIN_EMAIL: ADMIN,
  HERMES_AGENT_ENDPOINT: ENDPOINT,
  HERMES_AGENT_TOKEN: "crina-key",
  HERMES_AGENT_BACKUP_MODEL: undefined,
  SOCIAL_POSTING_ENABLED: "false",
  OPENAI_API_KEY: undefined,
  HUGGINGFACE_API_KEY: undefined,
  REPLICATE_API_TOKEN: undefined
};

function seed() {
  const db = new FakeSupabase({
    tables: {
      brands: [{ id: "b1", name: "NexRide", positioning: "EV rides" }],
      agents: [{ id: "a1", name: "Analytics Agent", status: "active" }],
      campaigns: [],
      content_items: [],
      approvals: [],
      activity: [],
      agent_runs: [],
      agent_config: [],
      agent_settings: []
    }
  });
  db.user = { email: ADMIN };
  holder.db = db;
  return db;
}

const hermesReply = (content: Record<string, unknown>) =>
  fakeFetch((url) => {
    assert.equal(url, ENDPOINT, "only the Hermes endpoint is called");
    return jsonResponse({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  });

const call = (agentId: string) =>
  run.POST(new Request(`https://os.example/api/os/agents/${agentId}/run`, { method: "POST" }), { params: Promise.resolve({ agentId }) });

test("every registered agent has a board job", () => {
  for (const agent of registeredAgents) assert.ok(boardTasks[agent.id], `missing board job for ${agent.id}`);
});

test("content creator: real draft recorded as success via Hermes with the crina key", async () => {
  const db = seed();
  const fetch = hermesReply({ summary: "Drafted a LinkedIn post on EV rides.", platform: "LinkedIn", hook: "h", body: "b", cta: "c", hashtags: ["#ev"] });
  const res = await withEnv(ENV, () => call("agent-content-creator"), fetch.fn);
  const body = await res.json();
  assert.equal(body.status, "success");
  assert.equal(body.outputSummary, "Drafted a LinkedIn post on EV rides.");
  assert.equal((fetch.calls[0].init.headers as Record<string, string>).Authorization, "Bearer crina-key");
  const row = db.rows("agent_runs").at(-1)!;
  assert.equal(row.status, "success");
  assert.equal(row.agent_name, "Content Creator Agent");
  assert.equal((row.output as Record<string, unknown>).body, "b");
});

test("publishing: ends 'Prepared, not posted' and records posted=false", async () => {
  const db = seed();
  const fetch = hermesReply({ summary: "Packaged the LinkedIn post.", platform: "LinkedIn", caption: "x", hashtags: [], postingWindow: "Tue 9:00", checklist: ["check"] });
  const body = await (await withEnv(ENV, () => call("agent-publishing"), fetch.fn)).json();
  assert.equal(body.status, "success");
  assert.match(body.outputSummary, /^Prepared, not posted: /);
  assert.equal(fetch.calls.length, 1, "no call besides the model");
  assert.equal((db.rows("agent_runs").at(-1)!.output as Record<string, unknown>).posted, false);
});

test("visual & video without an image key: needs_key with the concept, not error", async () => {
  const db = seed();
  const fetch = hermesReply({ summary: "4-slide carousel concept.", slides: [], videoStoryboard: [] });
  const body = await (await withEnv(ENV, () => call("agent-visual-video"), fetch.fn)).json();
  assert.equal(body.status, "needs_key");
  assert.match(body.outputSummary, /^Needs an image generation key/);
  assert.equal(db.rows("agent_runs").at(-1)!.status, "needs_key");
});

test("analytics: runs under agent-analytics with a real snapshot", async () => {
  seed();
  const fetch = hermesReply({ summary: "No campaigns yet.", findings: [], nextAction: "Run Crina." });
  const body = await (await withEnv(ENV, () => call("agent-analytics"), fetch.fn)).json();
  assert.equal(body.status, "success");
  const sent = JSON.parse((fetch.calls[0].body as { messages: Array<{ content: string }> }).messages[1].content);
  assert.deepEqual(sent.input.brands, ["NexRide"]);
});

test("Hermes not configured: error says so; unknown agent is 404", async () => {
  seed();
  const body = await (await withEnv({ ...ENV, HERMES_AGENT_ENDPOINT: undefined }, () => call("agent-seo"))).json();
  assert.equal(body.status, "error");
  assert.match(body.error, /HERMES_AGENT_ENDPOINT/);
  assert.equal((await withEnv(ENV, () => call("agent-nope"))).status, 404);
});
