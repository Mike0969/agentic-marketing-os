// Read-only "really connected?" checks, the Slack non-ASCII guard and the Jev status. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withEnv } from "./helpers/harness.ts";
const { classify, verifyLabel } = await import("../lib/social/verify.ts");
const { nonAsciiProblem } = await import("../lib/providers/utils.ts");
const slack = await import("../lib/providers/slack.ts");
const { getJevStatus } = await import("../lib/jev/status.ts");

test("provider answers map to valid / expired / revoked / error", () => {
  assert.equal(classify("linkedin", 200, { name: "Mihai" }, false).state, "valid");
  assert.equal(classify("x", 200, { data: { username: "nexride" } }, true).account, "nexride");
  const x401 = classify("x", 401, {}, true);
  assert.equal(x401.state, "expired");
  assert.match(x401.detail, /refresh token is stored/);
  assert.equal(classify("linkedin", 401, {}, false).state, "expired");
  assert.equal(classify("facebook", 400, { error: { code: 190, error_subcode: 463 } }, false).state, "expired");
  assert.equal(classify("instagram", 400, { error: { code: 190, error_subcode: 460 } }, false).state, "revoked");
  assert.equal(classify("facebook", 500, { error: { message: "boom" } }, false).state, "error");
});

test("labels for Settings", () => {
  const at = "2026-11-20T09:05:00.000Z";
  assert.equal(verifyLabel({ state: "valid", detail: "", checkedAt: at, account: null })!.text, "connected · verified 09:05 UTC");
  assert.equal(verifyLabel({ state: "expired", detail: "rejected", checkedAt: at, account: null })!.text, "expired — Reconnect");
  assert.match(verifyLabel({ state: "expired", detail: "a refresh token is stored", checkedAt: at, account: null })!.text, /renews before posting/);
  assert.equal(verifyLabel({ state: "revoked", detail: "", checkedAt: at, account: null })!.text, "revoked — Reconnect");
});

test("Slack: a pasted '…' placeholder gives a readable error, not a ByteString crash", async () => {
  assert.match(nonAsciiProblem({ SLACK_BOT_TOKEN: "xoxb-…" })!, /SLACK_BOT_TOKEN contains non-ASCII/);
  assert.equal(nonAsciiProblem({ SLACK_BOT_TOKEN: "xoxb-123" }), null);
  const health = await withEnv({ SLACK_BOT_TOKEN: "xoxb-…", SLACK_CHANNEL_ID: "C…" }, () => slack.healthCheck());
  assert.equal(health.status, "error");
  const missing = await withEnv({ SLACK_BOT_TOKEN: undefined }, () => slack.healthCheck());
  assert.equal(missing.status, "not_configured");
});

test("Jev status without a key says not configured", async () => {
  const s = await withEnv({ TYPESAFE_API_KEY: undefined }, () => getJevStatus(true));
  assert.equal(s.state, "not_configured");
});
