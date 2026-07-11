import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "../lib/health/readiness.ts";

// A fully-wired environment for the three REQUIRED capabilities.
const FULL = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  AGENT_TRIGGER_TOKEN: "tok",
  HERMES_AGENT_ENDPOINT: "https://hermes",
  HERMES_AGENT_TOKEN: "h"
};

test("empty env → fallback, zero required ready", () => {
  const r = computeReadiness({});
  assert.equal(r.overall, "fallback");
  assert.equal(r.requiredReady, 0);
  assert.equal(r.requiredTotal, 3);
});

test("secret VALUES never appear in the report (only env names)", () => {
  const sentinel = "ZZ_SECRET_VALUE_NEVER_LEAK_9137";
  const r = computeReadiness({
    NEXT_PUBLIC_SUPABASE_URL: sentinel,
    SUPABASE_SERVICE_ROLE_KEY: sentinel,
    AGENT_TRIGGER_TOKEN: sentinel,
    HERMES_AGENT_ENDPOINT: sentinel,
    HERMES_AGENT_TOKEN: sentinel,
    RESEND_API_KEY: sentinel
  });
  assert.ok(!JSON.stringify(r).includes(sentinel), "a secret value leaked into the readiness report");
});

test("all required set → autonomous", () => {
  const r = computeReadiness(FULL);
  assert.equal(r.overall, "autonomous");
  assert.equal(r.requiredReady, 3);
  assert.equal(r.requiredReady, r.requiredTotal);
});

test("some but not all required → degraded", () => {
  const r = computeReadiness({ ...FULL, HERMES_AGENT_ENDPOINT: undefined, HERMES_AGENT_TOKEN: undefined });
  assert.equal(r.overall, "degraded");
  assert.equal(r.requiredReady, 2);
  const brain = r.capabilities.find((c) => c.key === "agent-brain");
  assert.equal(brain?.status, "missing");
  assert.ok(brain?.missingEnv.includes("HERMES_AGENT_ENDPOINT"));
});

test("database needs BOTH url and service key", () => {
  const urlOnly = computeReadiness({ ...FULL, SUPABASE_SERVICE_ROLE_KEY: undefined });
  assert.equal(urlOnly.capabilities.find((c) => c.key === "database")?.status, "missing");
});

test("social posting off by default reads as 'disabled', not 'missing'", () => {
  const r = computeReadiness(FULL); // SOCIAL_POSTING_ENABLED unset
  const posting = r.capabilities.find((c) => c.key === "social-posting");
  assert.equal(posting?.status, "disabled");
  // required rollup is unaffected by an optional capability
  assert.equal(r.overall, "autonomous");
});

test("posting enabled but no network app → missing", () => {
  const r = computeReadiness({ ...FULL, SOCIAL_POSTING_ENABLED: "true" });
  assert.equal(r.capabilities.find((c) => c.key === "social-posting")?.status, "missing");
});

test("posting enabled with a network OAuth app → ready and lists the network", () => {
  const r = computeReadiness({ ...FULL, SOCIAL_POSTING_ENABLED: "true", LINKEDIN_CLIENT_ID: "id", LINKEDIN_CLIENT_SECRET: "sec" });
  const posting = r.capabilities.find((c) => c.key === "social-posting");
  assert.equal(posting?.status, "ready");
  assert.ok(posting?.detail.includes("LinkedIn"));
});

test("blank string is treated as unset", () => {
  const r = computeReadiness({ ...FULL, AGENT_TRIGGER_TOKEN: "   " });
  assert.equal(r.capabilities.find((c) => c.key === "autopilot-trigger")?.status, "missing");
});

test("GSC needs both auth and a site", () => {
  const authNoSite = computeReadiness({ ...FULL, GOOGLE_SEARCH_CONSOLE_TOKEN: "t" });
  assert.equal(authNoSite.capabilities.find((c) => c.key === "analytics")?.status, "missing");
  const authAndSite = computeReadiness({ ...FULL, GOOGLE_SEARCH_CONSOLE_TOKEN: "t", GOOGLE_SEARCH_CONSOLE_SITE: "sc-domain:x" });
  assert.equal(authAndSite.capabilities.find((c) => c.key === "analytics")?.status, "ready");
});

test("every capability has non-empty operator-facing detail", () => {
  for (const c of computeReadiness({}).capabilities) {
    assert.ok(c.detail.length > 10, `capability ${c.key} needs a real detail string`);
  }
});
