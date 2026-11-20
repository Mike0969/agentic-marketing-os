// Settings managed from the UI: providers (encrypted keys, priority over env, routing, budget),
// notification channels, learning library. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const { chatModels, compatChat } = await import("../lib/providers/compat.ts");
const store = await import("../lib/providers/user-providers.ts");
const { callModel } = await import("../lib/providers/call-model.ts");
const channels = await import("../lib/notify/channels.ts");
const { libraryText, addLearningItem } = await import("../lib/learning/library.ts");
const providersRoute = await import("../app/api/os/model-providers/route.ts");

const ADMIN = "admin@example.com";
const KEY = "a".repeat(64);
// Fake test keys, built at runtime so secret scanners do not flag them.
const fakeKey = (tag: string) => ["sk", "test", tag, "0".repeat(6)].join("-");
const ENV = { ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN, SOCIAL_TOKEN_ENCRYPTION_KEY: KEY, OPENAI_API_KEY: "sk-env-key-0000", HERMES_AGENT_ENDPOINT: undefined };

function seed(user: string | null = ADMIN) {
  const db = new FakeSupabase({ tables: { model_providers: [], notification_channels: [], learning_items: [], model_budget: [{ id: 1, per_campaign_max: 40, per_day_max: 150 }], model_calls: [] } });
  db.user = user ? { email: user } : null;
  holder.db = db;
  return db;
}

test("only chat models are offered (no tts/whisper/embeddings/realtime/image)", () => {
  assert.deepEqual(chatModels(["gpt-5-mini", "tts-1", "whisper-1", "text-embedding-3-small", "gpt-realtime", "gpt-image-2", "deepseek-flash", "models/gemini-2.5-flash", "o3"]), ["deepseek-flash", "gemini-2.5-flash", "gpt-5-mini", "o3"]);
});

test("OpenAI-compatible call: JSON hint, no temperature for gpt-5, bearer key", async () => {
  const f = fakeFetch(() => jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }));
  const r = await compatChat({ kind: "deepseek", baseUrl: "https://api.deepseek.com", apiKey: "sk-x" }, "gpt-5-mini", { system: "Write.", user: "hi", jsonSchema: { ok: "bool" } }, f.fn);
  assert.equal(r.ok, true);
  const body = f.calls[0].body as Record<string, unknown>;
  assert.equal("temperature" in body, false);
  assert.match(String((body.messages as Array<{ content: string }>)[0].content), /JSON/);
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-x");
});

test("adding a provider stores the key encrypted and never returns it", async () => {
  const db = seed();
  const p = await withEnv(ENV, () => store.addUserProvider({ kind: "deepseek", name: "DS", apiKey: fakeKey("secret") }));
  assert.equal(p.key_last4, "0000");
  assert.equal("api_key_enc" in p, false);
  const row = db.rows("model_providers")[0];
  assert.match(String(row.api_key_enc), /^enc:v1:/);
  assert.ok(!String(row.api_key_enc).includes("secret"));
  const list = await withEnv(ENV, () => store.listUserProviders());
  assert.ok(!JSON.stringify(list).includes(fakeKey("secret")));
});

test("no encryption key on the server: refuse to store a provider key", async () => {
  seed();
  await assert.rejects(withEnv({ ...ENV, SOCIAL_TOKEN_ENCRYPTION_KEY: undefined }, () => store.addUserProvider({ kind: "openai", apiKey: fakeKey("secret") })), /cannot be stored encrypted/);
});

test("placeholder keys and bad custom URLs are refused", async () => {
  seed();
  await assert.rejects(withEnv(ENV, () => store.addUserProvider({ kind: "openai", apiKey: "sk-…" })), /full API key|non-ASCII/);
  await assert.rejects(withEnv(ENV, () => store.addUserProvider({ kind: "custom", apiKey: fakeKey("secret"), baseUrl: "ftp://x" })), /base URL/);
});

test("a UI OpenAI provider takes priority over the env key; the call is charged to the budget", async () => {
  const db = seed();
  await withEnv(ENV, () => store.addUserProvider({ kind: "openai", name: "Mine", apiKey: fakeKey("ui") }));
  const f = fakeFetch(() => jsonResponse({ choices: [{ message: { content: "OK" } }] }));
  const r = await withEnv(ENV, () => callModel({ provider: "openai", model: "gpt-4o-mini", agentId: "agent-seo", fallbackAgentName: "SEO", task: "t", system: "s", user: "u" }), f.fn);
  assert.equal(r.ok, true);
  assert.equal((f.calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${fakeKey("ui")}`, "UI key, not the env key");
  assert.equal(db.rows("model_calls").length, 1);
  assert.equal(db.rows("model_calls")[0].kind, "openai");
});

test("custom:<id> routes to that provider; disabled -> clear error, no call", async () => {
  seed();
  const p = await withEnv(ENV, () => store.addUserProvider({ kind: "custom", name: "LocalLLM", apiKey: fakeKey("local"), baseUrl: "https://llm.example/v1" }));
  const f = fakeFetch(() => jsonResponse({ choices: [{ message: { content: "OK" } }] }));
  const r = await withEnv(ENV, () => callModel({ provider: p.providerKey, model: "m1", agentId: "a", fallbackAgentName: "A", task: "t", system: "s", user: "u" }), f.fn);
  assert.equal(r.ok, true);
  assert.equal(f.calls[0].url, "https://llm.example/v1/chat/completions");
  await withEnv(ENV, () => store.updateUserProvider(p.id, { enabled: false }));
  const f2 = fakeFetch(() => jsonResponse({}));
  const r2 = await withEnv(ENV, () => callModel({ provider: p.providerKey, model: "m1", agentId: "a", fallbackAgentName: "A", task: "t", system: "s", user: "u" }), f2.fn);
  assert.equal(r2.ok, false);
  assert.match(r2.error!, /removed or disabled/);
  assert.equal(f2.calls.length, 0);
});

test("OpenRouter key check uses /key (its /models is public)", async () => {
  const { checkCompatKey } = await import("../lib/providers/compat.ts");
  const bad = fakeFetch(() => jsonResponse({ error: { message: "No auth credentials found" } }, 401));
  await assert.rejects(checkCompatKey({ kind: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "x" }, bad.fn), /Key rejected \(HTTP 401/);
  assert.equal(bad.calls[0].url, "https://openrouter.ai/api/v1/key");
  const none = fakeFetch(() => jsonResponse({}));
  await checkCompatKey({ kind: "deepseek", baseUrl: "https://api.deepseek.com", apiKey: "x" }, none.fn);
  assert.equal(none.calls.length, 0);
});

test("Settings provider API is admin only", async () => {
  seed("someone@example.com");
  const res = await withEnv(ENV, () => providersRoute.POST(new Request("https://os.example/api/os/model-providers", { method: "POST", body: JSON.stringify({ kind: "openai", apiKey: fakeKey("secret") }) })));
  assert.equal(res.status, 403);
});

test("notification channel: encrypted token, UI first, env fallback", async () => {
  seed();
  const c = await withEnv(ENV, () => channels.addChannel({ kind: "telegram", name: "Mine", token: "123456:ABCDEFGHIJ", channelId: "42" }));
  assert.equal(c.token_last4, "GHIJ");
  assert.equal("token_enc" in c, false);
  const ui = await withEnv(ENV, () => channels.resolveChannel("telegram"));
  assert.deepEqual({ source: ui?.source, token: ui?.token, channelId: ui?.channelId }, { source: "ui", token: "123456:ABCDEFGHIJ", channelId: "42" });
  seed();
  const env = await withEnv({ ...ENV, TELEGRAM_BOT_TOKEN: "env-token-1", TELEGRAM_CHAT_ID: "7" }, () => channels.resolveChannel("telegram"));
  assert.equal(env?.source, "env");
  assert.equal(await withEnv({ ...ENV, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, () => channels.resolveChannel("telegram")), null);
});

test("learning library: validation and the block the agents read", async () => {
  seed();
  await assert.rejects(withEnv(ENV, () => addLearningItem({ type: "youtube", title: "Talk", url: "https://vimeo.com/1" })), /YouTube/);
  await assert.rejects(withEnv(ENV, () => addLearningItem({ type: "idea", title: "Empty idea" })), /Write the idea/);
  const item = await withEnv(ENV, () => addLearningItem({ type: "youtube", title: "Founder talk", url: "https://youtu.be/abc", tags: "drivers, Dubai", notes: "Drivers keep the fare." }));
  assert.deepEqual(item.tags, ["drivers", "dubai"]);
  const text = libraryText([item]);
  assert.match(text, /^Reference materials from Mihai/);
  assert.match(text, /\[YouTube\] Founder talk \(drivers, dubai\): Drivers keep the fare\. <https:\/\/youtu\.be\/abc>/);
  assert.equal(libraryText([]), "");
});
