import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FakeSupabase } from "./helpers/fake-supabase.ts";
import {
  escapeHtml,
  safeHref,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  handleUnsubscribe
} from "../lib/email/unsubscribe.ts";
import { renderNurtureEmail, runNurtureDrip } from "../lib/marketing/nurture.ts";

const ENV = { EMAIL_UNSUBSCRIBE_SECRET: "test-secret-1", NEXT_PUBLIC_SITE_URL: "https://os.example" };

test("escapeHtml escapes markup and quotes; safeHref refuses non-http", () => {
  assert.equal(escapeHtml(`<b a="1">'x'&</b>`), "&lt;b a=&quot;1&quot;&gt;&#39;x&#39;&amp;&lt;/b&gt;");
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("not a url"), "#");
  assert.equal(safeHref(`https://a.example/x?q="><script>`), "https://a.example/x?q=%22%3E%3Cscript%3E");
});

test("unsubscribe token: round trip, tamper, wrong secret, no secret", () => {
  const t = signUnsubscribeToken("Ana@Example.com", ENV)!;
  assert.equal(verifyUnsubscribeToken(t, ENV), "ana@example.com");
  const [p, s] = t.split(".");
  const other = Buffer.from("victim@example.com").toString("base64url");
  assert.equal(verifyUnsubscribeToken(`${other}.${s}`, ENV), null);
  assert.equal(verifyUnsubscribeToken(`${p}.${s}x`, ENV), null);
  assert.equal(verifyUnsubscribeToken(t, { EMAIL_UNSUBSCRIBE_SECRET: "other" }), null);
  assert.equal(signUnsubscribeToken("a@b.c", {}), null);
  assert.equal(verifyUnsubscribeToken(t, {}), null);
  assert.equal(unsubscribeUrl("a@b.c", { EMAIL_UNSUBSCRIBE_SECRET: "x" }), null);
});

test("renderNurtureEmail escapes lead/brand values and adds an unsubscribe link", () => {
  const e = renderNurtureEmail(2, {
    name: `<script>alert(1)</script>`,
    brand: `Acme" onmouseover="x`,
    subscribeUrl: "javascript:alert(1)",
    unsubscribeUrl: "https://os.example/api/email/unsubscribe?t=abc"
  })!;
  assert.ok(!e.html.includes("<script>"));
  assert.ok(e.html.includes("&lt;script&gt;"));
  assert.ok(!e.html.includes(`Acme" onmouseover`));
  assert.ok(!e.html.includes("javascript:"));
  assert.ok(e.html.includes(`href="https://os.example/api/email/unsubscribe?t=abc"`));
  assert.equal(renderNurtureEmail(99, { name: "", brand: "", subscribeUrl: "", unsubscribeUrl: "" }), null);
});

function dripDb() {
  const past = new Date(Date.now() - 60_000).toISOString();
  return new FakeSupabase({
    tables: {
      lead_nurture: [
        { id: "n1", lead_id: "l1", brand_id: "b1", sequence_key: "default", step: 0, status: "active", next_send_at: past },
        { id: "n2", lead_id: "l2", brand_id: "b1", sequence_key: "default", step: 0, status: "active", next_send_at: past }
      ],
      leads: [
        { id: "l1", email: "ok@example.com", name: "<i>Ok</i>" },
        { id: "l2", email: "Gone@Example.com", name: "Gone" }
      ],
      brands: [{ id: "b1", name: "Brand" }],
      email_suppressions: [{ email: "gone@example.com", reason: "unsubscribe", source: "link" }],
      email_sends: []
    }
  });
}

test("drip: sends with one-click headers, skips + stops suppressed addresses, logs both", async () => {
  const db = dripDb();
  const sent: Array<{ to: string; html: string; headers?: Record<string, string> }> = [];
  const res = await runNurtureDrip(25, {
    db: db as never,
    env: ENV,
    send: async (a) => {
      sent.push(a);
      return { ok: true, id: "prov-1" };
    }
  });
  assert.deepEqual(res, { sent: 1, suppressed: 1, due: 2 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ok@example.com");
  assert.ok(sent[0].headers?.["List-Unsubscribe"]?.startsWith("<https://os.example/api/email/unsubscribe?t="));
  assert.equal(sent[0].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(sent[0].html.includes("&lt;i&gt;Ok&lt;/i&gt;"));
  assert.equal(db.rows("lead_nurture").find((r) => r.id === "n2")!.status, "stopped");
  assert.equal(db.rows("lead_nurture").find((r) => r.id === "n1")!.step, 1);
  assert.deepEqual(db.rows("email_sends").map((r) => r.status).sort(), ["sent", "suppressed"]);
});

test("drip: refuses to send without unsubscribe config", async () => {
  const db = dripDb();
  let calls = 0;
  const res = await runNurtureDrip(25, { db: db as never, env: { NEXT_PUBLIC_SITE_URL: "https://x" }, send: async () => (calls++, { ok: true }) });
  assert.equal(res.skipped, "no-unsubscribe-config");
  assert.equal(calls, 0);
});

test("drip: a suppression lookup error fails closed (no send)", async () => {
  const db = dripDb();
  db.failOn["email_suppressions:select"] = "db down";
  let calls = 0;
  const res = await runNurtureDrip(25, { db: db as never, env: ENV, send: async () => (calls++, { ok: true }) });
  assert.equal(calls, 0);
  assert.equal(res.sent, 0);
});

test("unsubscribe handler: GET changes nothing, POST suppresses and stops the drip, bad token 400", async () => {
  const db = dripDb();
  db.tables.email_suppressions = [];
  const t = signUnsubscribeToken("ok@example.com", ENV)!;
  const u = `https://os.example/api/email/unsubscribe?t=${encodeURIComponent(t)}`;

  const get = await handleUnsubscribe(new Request(u), { db: db as never, env: ENV });
  assert.equal(get.status, 200);
  assert.match(await get.text(), /<form method="post"/);
  assert.equal(db.rows("email_suppressions").length, 0);

  const post = await handleUnsubscribe(new Request(u, { method: "POST", body: "List-Unsubscribe=One-Click" }), { db: db as never, env: ENV });
  assert.equal(post.status, 200);
  assert.deepEqual(db.rows("email_suppressions").map((r) => [r.email, r.reason]), [["ok@example.com", "unsubscribe"]]);
  assert.equal(db.rows("lead_nurture").find((r) => r.id === "n1")!.status, "stopped");

  const again = await handleUnsubscribe(new Request(u, { method: "POST" }), { db: db as never, env: ENV });
  assert.equal(again.status, 200);
  assert.equal(db.rows("email_suppressions").length, 1);

  const bad = await handleUnsubscribe(new Request("https://os.example/api/email/unsubscribe?t=x.y", { method: "POST" }), { db: db as never, env: ENV });
  assert.equal(bad.status, 400);
});

test("route /api/email/unsubscribe uses the service client", async () => {
  const db = dripDb();
  db.tables.email_suppressions = [];
  mock.module(pathToFileURL(path.resolve("lib/supabase/service.ts")).href, {
    namedExports: { createServiceClient: () => db, isServiceConfigured: () => true }
  });
  const saved = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  process.env.EMAIL_UNSUBSCRIBE_SECRET = ENV.EMAIL_UNSUBSCRIBE_SECRET;
  try {
    const route = await import("../app/api/email/unsubscribe/route.ts");
    const t = signUnsubscribeToken("ok@example.com", ENV)!;
    const res = await route.POST(new Request(`https://os.example/api/email/unsubscribe?t=${encodeURIComponent(t)}`, { method: "POST" }));
    assert.equal(res.status, 200);
    assert.equal(db.rows("email_suppressions").length, 1);
  } finally {
    if (saved === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.EMAIL_UNSUBSCRIBE_SECRET = saved;
  }
});

test("readiness: email nurture needs the Resend key AND the unsubscribe settings", async () => {
  const { computeReadiness } = await import("../lib/health/readiness.ts");
  const only = computeReadiness({ RESEND_API_KEY: "k" }).capabilities.find((c) => c.key === "email-nurture")!;
  assert.equal(only.status, "missing");
  assert.deepEqual(only.missingEnv, ["EMAIL_UNSUBSCRIBE_SECRET", "NEXT_PUBLIC_SITE_URL"]);
  const all = computeReadiness({ RESEND_API_KEY: "k", EMAIL_UNSUBSCRIBE_SECRET: "s", NEXT_PUBLIC_SITE_URL: "https://x" }).capabilities.find((c) => c.key === "email-nurture")!;
  assert.equal(all.status, "ready");
});
