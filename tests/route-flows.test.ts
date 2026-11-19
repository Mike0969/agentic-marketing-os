// API-route tests for the existing approval -> schedule -> post flows and the cron.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const approvals = await import("../app/api/marketing/approvals/[contentItemId]/route.ts");
const schedule = await import("../app/api/marketing/content-items/[id]/schedule/route.ts");
const runDue = await import("../app/api/marketing/schedule/run-due/route.ts");
const cron = await import("../app/api/marketing/automation/cron/route.ts");

const ADMIN = "admin@example.com";
const BRAND = "44444444-4444-4444-8444-444444444444";
const ENV = {
  ...SUPABASE_ENV,
  ADMIN_EMAIL: ADMIN,
  AGENT_TRIGGER_TOKEN: "agent-tok",
  CRON_SECRET: "cron-tok",
  SOCIAL_POSTING_ENABLED: undefined,
  SOCIAL_TOKEN_ENCRYPTION_KEY: undefined,
  RESEND_API_KEY: undefined,
  NEXT_PUBLIC_SITE_URL: "https://os.example"
};
const recent = new Date().toISOString();

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}, user: string | null = ADMIN) {
  const db = new FakeSupabase({
    tables: {
      brands: [{ id: BRAND, name: "Brand" }],
      content_items: [
        { id: "c1", brand_id: BRAND, campaign_id: null, title: "Post", body: "Body", hook: "Hook", CTA: "Go", platform: "Facebook", content_type: "post", status: "approval", approval_status: "pending", scheduled_at: null, archived_at: null, ready_package: { text: "Hello" } }
      ],
      approvals: [],
      feedback_memory: [],
      activity: [],
      // Recent runs/outcomes keep the weekly jobs and the GSC refresh quiet in cron tests.
      agent_runs: [
        { workflow_name: "Consolidate Memory", created_at: recent },
        { workflow_name: "Weekly Reflection", created_at: recent },
        { workflow_name: "Weekly Summary", created_at: recent }
      ],
      conversion_outcomes: [{ source: "google_search", created_at: recent }],
      campaigns: [],
      ...extra
    }
  });
  db.user = user ? { email: user } : null;
  holder.db = db;
  return db;
}

const approve = (body: Record<string, unknown>, id = "c1") =>
  approvals.POST(new Request(`https://os.example/api/marketing/approvals/${id}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ contentItemId: id }) });

test("approvals: no session -> 401, non-admin -> 403", async () => {
  seed({}, null);
  assert.equal((await withEnv(ENV, () => approve({ decision: "approved" }))).status, 401);
  seed({}, "someone@example.com");
  assert.equal((await withEnv(ENV, () => approve({ decision: "approved" }))).status, 403);
});

test("approvals: bad decision and reject-without-reason are 400 and change nothing", async () => {
  const db = seed();
  assert.equal((await withEnv(ENV, () => approve({ decision: "maybe" }))).status, 400);
  assert.equal((await withEnv(ENV, () => approve({ decision: "rejected" }))).status, 400);
  assert.equal((await withEnv(ENV, () => approve({ decision: "approved", scheduled_at: "not a date" }))).status, 400);
  assert.equal(db.rows("content_items")[0].status, "approval");
  assert.equal(db.rows("approvals").length, 0);
});

test("approvals: final (gate 2) approval schedules the post and records the decision", async () => {
  const db = seed();
  const res = await withEnv(ENV, () => approve({ decision: "approved" }));
  assert.equal(res.status, 200);
  const item = db.rows("content_items")[0];
  assert.equal(item.status, "scheduled");
  assert.equal(item.approval_status, "approved");
  assert.equal(item.workflow_stage, "publishing_prep");
  assert.ok(item.scheduled_at && !Number.isNaN(Date.parse(String(item.scheduled_at))), "auto-scheduled");
  assert.equal(db.rows("approvals")[0].decision, "approved");
  assert.equal(db.rows("feedback_memory")[0].decision, "approved");
});

test("approvals: gate 1 approval moves to visual; an operator time is kept", async () => {
  let db = seed();
  await withEnv(ENV, () => approve({ decision: "approved", gate: "gate_1" }));
  assert.equal(db.rows("content_items")[0].status, "visual");
  db = seed();
  await withEnv(ENV, () => approve({ decision: "approved", scheduled_at: "2030-01-02T09:00:00Z" }));
  assert.equal(db.rows("content_items")[0].scheduled_at, "2030-01-02T09:00:00.000Z");
});

test("approvals: reject + archive takes the item off every active screen", async () => {
  const db = seed();
  const res = await withEnv(ENV, () => approve({ decision: "rejected", feedback: "off-brand", archive: true }));
  assert.equal(res.status, 200);
  const item = db.rows("content_items")[0];
  assert.equal(item.status, "draft");
  assert.ok(item.archived_at);
  assert.equal(item.scheduled_at, null);
  assert.equal(db.rows("approvals")[0].feedback, "off-brand");
});

test("schedule route: set a time, refuse published posts, remove = archive", async () => {
  const db = seed();
  const call = (body: Record<string, unknown>) =>
    schedule.POST(new Request("https://os.example/x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "c1" }) });
  assert.equal((await withEnv(ENV, () => call({ scheduled_at: "nope" }))).status, 400);
  assert.equal((await withEnv(ENV, () => call({ scheduled_at: "2030-05-05T10:00:00Z" }))).status, 200);
  assert.equal(db.rows("content_items")[0].status, "scheduled");
  assert.equal((await withEnv(ENV, () => call({ action: "remove" }))).status, 200);
  assert.ok(db.rows("content_items")[0].archived_at);
  db.rows("content_items")[0].status = "published";
  assert.equal((await withEnv(ENV, () => call({ scheduled_at: "2030-05-05T10:00:00Z" }))).status, 409);
});

test("run-due route: admin only; with posting off nothing is posted", async () => {
  seed({}, null);
  assert.equal((await withEnv(ENV, () => runDue.POST())).status, 401);
  seed();
  const body = (await (await withEnv(ENV, () => runDue.POST())).json()) as Record<string, unknown>;
  assert.equal(body.skipped, "posting_off");
  assert.equal(body.posted, 0);
});

function dueFacebookPost() {
  return seed({
    content_items: [
      { id: "fb1", brand_id: BRAND, title: "FB", body: "Body", platform: "Facebook", status: "scheduled", approval_status: "approved", scheduled_at: new Date(Date.now() - 60_000).toISOString(), archived_at: null, ready_package: { text: "Hello page" } }
    ],
    social_connections: [{ brand_id: BRAND, platform: "facebook", access_token: "PAGE_TOKEN", refresh_token: null, expires_at: null, author_urn: "page1", scopes: null, status: "connected" }]
  });
}

test("cron: rejects a request without a valid token or session", async () => {
  seed({}, null);
  const res = await withEnv(ENV, () => cron.GET(new Request("https://os.example/api/marketing/automation/cron", { headers: { authorization: "Bearer wrong" } })));
  assert.equal(res.status, 401);
});

test("cron: Vercel's CRON_SECRET runs the cycle and fires a due, approved post", async () => {
  const db = dueFacebookPost();
  const fb = fakeFetch((url, init) => {
    assert.equal(url, "https://graph.facebook.com/v20.0/page1/feed");
    assert.equal(new URLSearchParams(String(init.body)).get("access_token"), "PAGE_TOKEN");
    return jsonResponse({ id: "page1_77" });
  });
  const res = await withEnv({ ...ENV, SOCIAL_POSTING_ENABLED: "true" }, () =>
    cron.GET(new Request("https://os.example/api/marketing/automation/cron", { headers: { authorization: "Bearer cron-tok" } })), fb.fn);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { due_posts: { posted: number }; nurture: { skipped?: string } };
  assert.equal(body.due_posts.posted, 1);
  assert.equal(body.nurture.skipped, "no-resend-key");
  assert.equal(fb.calls.length, 1);
  const item = db.rows("content_items")[0];
  assert.equal(item.status, "published");
  assert.equal((item.ready_package as Record<string, unknown>).posted_url, "https://www.facebook.com/page1_77");
});

test("cron: with posting off, a due post is left untouched", async () => {
  const db = dueFacebookPost();
  const res = await withEnv(ENV, () => cron.POST(new Request("https://os.example/api/marketing/automation/cron", { method: "POST", headers: { authorization: "Bearer agent-tok" } })));
  assert.equal(res.status, 200);
  assert.equal(db.rows("content_items")[0].status, "scheduled");
});

test("cron: a dead token (401) marks the connection expired so Settings says so", async () => {
  const db = dueFacebookPost();
  const fb = fakeFetch(() => new Response('{"error":{"message":"Invalid OAuth access token"}}', { status: 401 }));
  await withEnv({ ...ENV, SOCIAL_POSTING_ENABLED: "true" }, () =>
    cron.GET(new Request("https://os.example/api/marketing/automation/cron", { headers: { authorization: "Bearer cron-tok" } })), fb.fn);
  assert.equal(db.rows("social_connections")[0].status, "expired");
  assert.equal(db.rows("content_items")[0].status, "scheduled");
  assert.match(String((db.rows("content_items")[0].ready_package as Record<string, unknown>).posting_error), /401/);
});
