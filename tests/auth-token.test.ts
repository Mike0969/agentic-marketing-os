import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, hasValidBearer, safeTokenEqual } from "../lib/auth-token.ts";

const req = (auth?: string) => new Request("http://x/api", { headers: auth ? { authorization: auth } : {} });

test("bearerToken extracts only Bearer tokens", () => {
  assert.equal(bearerToken(req("Bearer abc ")), "abc");
  assert.equal(bearerToken(req("Basic abc")), "");
  assert.equal(bearerToken(req()), "");
});

test("safeTokenEqual: equal, different, different length, empty", () => {
  assert.equal(safeTokenEqual("secret-1", "secret-1"), true);
  assert.equal(safeTokenEqual("secret-1", "secret-2"), false);
  assert.equal(safeTokenEqual("short", "a-much-longer-secret"), false);
  assert.equal(safeTokenEqual("", ""), false);
});

test("hasValidBearer accepts AGENT_TRIGGER_TOKEN or CRON_SECRET", () => {
  const env = { AGENT_TRIGGER_TOKEN: "agent-tok", CRON_SECRET: "cron-tok" };
  const names = ["AGENT_TRIGGER_TOKEN", "CRON_SECRET"];
  assert.equal(hasValidBearer(req("Bearer agent-tok"), names, env), true);
  assert.equal(hasValidBearer(req("Bearer cron-tok"), names, env), true);
  assert.equal(hasValidBearer(req("Bearer nope"), names, env), false);
  assert.equal(hasValidBearer(req(), names, env), false);
});

test("hasValidBearer: unset/empty env never matches", () => {
  const names = ["AGENT_TRIGGER_TOKEN", "CRON_SECRET"];
  assert.equal(hasValidBearer(req("Bearer "), names, {}), false);
  assert.equal(hasValidBearer(req("Bearer x"), names, { AGENT_TRIGGER_TOKEN: "", CRON_SECRET: "  " }), false);
});

test("requireAgentAccess (lib/auth.ts) accepts CRON_SECRET and AGENT_TRIGGER_TOKEN; a wrong token is not let in", async () => {
  const saved = { ...process.env };
  try {
    // Supabase "configured" (never contacted): the token path must succeed without a session.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.AGENT_TRIGGER_TOKEN = "agent-only";
    process.env.CRON_SECRET = "cron-only";
    const { requireAgentAccess } = await import("../lib/auth.ts");
    assert.equal((await requireAgentAccess(req("Bearer cron-only"))).ok, true);
    assert.equal((await requireAgentAccess(req("Bearer agent-only"))).ok, true);
    // A wrong token falls through to the session check, which cannot pass here (no request scope).
    const wrong = await requireAgentAccess(req("Bearer wrong")).then((r) => r.ok, () => false);
    assert.equal(wrong, false);
  } finally {
    process.env = saved;
  }
});

test("missing Supabase config fails closed: no admin, and a wrong cron token is refused (prod and default)", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.AGENT_TRIGGER_TOKEN = "expected";
    process.env.CRON_SECRET = "expected-cron";
    const { requireAdmin, requireAgentAccess, getShellAuthStatus } = await import("../lib/auth.ts");
    for (const [nodeEnv, localMode] of [["production", undefined], ["production", "true"], ["development", undefined]] as const) {
      (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
      if (localMode) process.env.LOCAL_MODE = localMode;
      else delete process.env.LOCAL_MODE;
      const admin = await requireAdmin();
      assert.equal(admin.ok, false, `${nodeEnv}/${localMode}`);
      assert.equal(!admin.ok && admin.status, 503);
      assert.equal((await requireAgentAccess(req("Bearer wrong"))).ok, false);
      assert.equal((await requireAgentAccess(req("Bearer expected-cron"))).ok, true, "a valid token still works");
      assert.equal((await getShellAuthStatus()).isAdmin, false);
    }
    // Explicit local mode outside production is the only open case.
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.LOCAL_MODE = "true";
    assert.equal((await requireAdmin()).ok, true);
    assert.equal((await getShellAuthStatus()).isAdmin, true);
  } finally {
    process.env = saved;
  }
});
