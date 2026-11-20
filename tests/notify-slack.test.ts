import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyOperator } from "../lib/marketing/notify.ts";

const KEYS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"] as const;

async function captureCalls(env: Partial<Record<(typeof KEYS)[number], string>>, run: () => Promise<void>) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const savedFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = savedFetch;
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return calls;
}

test("notifyOperator sends the same text to Telegram and Slack when both are configured", async () => {
  const calls = await captureCalls(
    { TELEGRAM_BOT_TOKEN: "tg-tok", TELEGRAM_CHAT_ID: "123", SLACK_BOT_TOKEN: "xoxb-test", SLACK_CHANNEL_ID: "C123" },
    () => notifyOperator("📊 Weekly summary")
  );
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.includes("api.telegram.org"));
  const slack = calls.find((c) => c.url.includes("slack.com/api/chat.postMessage"));
  assert.ok(slack);
  assert.equal(slack.body.channel, "C123");
  assert.equal(slack.body.text, "🤖 Agentic Marketing OS\n📊 Weekly summary");
  assert.equal(calls[0].body.text, "🤖 Agentic Marketing OS\n📊 Weekly summary");
});

test("notifyOperator posts to Slack alone when Telegram is unset", async () => {
  const calls = await captureCalls({ SLACK_BOT_TOKEN: "xoxb-test", SLACK_CHANNEL_ID: "C123" }, () => notifyOperator("hi"));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("slack.com"));
});

test("notifyOperator skips Slack when it is not configured", async () => {
  const calls = await captureCalls({ TELEGRAM_BOT_TOKEN: "tg-tok", TELEGRAM_CHAT_ID: "123" }, () => notifyOperator("hi"));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("api.telegram.org"));
});
