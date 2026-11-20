// Pause / resume a campaign's automation (the 2-minute cron skips paused campaigns).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const route = await import("../app/api/marketing/campaigns/[id]/automation-state/route.ts");
const ADMIN = "admin@example.com";
const call = (action: unknown, id = "c1") =>
  route.POST(new Request(`https://os.example/api/marketing/campaigns/${id}/automation-state`, { method: "POST", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id }) });

function seed(user: string | null = ADMIN) {
  const db = new FakeSupabase({ tables: { campaigns: [{ id: "c1", title: "Old", status: "active", automation_status: "running" }], activity: [] } });
  db.user = user ? { email: user } : null;
  holder.db = db;
  return db;
}

test("pause then resume flips automation_status and logs activity", async () => {
  const db = seed();
  const env = { ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN };
  assert.equal((await withEnv(env, () => call("pause"))).status, 200);
  assert.equal(db.rows("campaigns")[0].automation_status, "paused");
  assert.equal((await withEnv(env, () => call("resume"))).status, 200);
  assert.equal(db.rows("campaigns")[0].automation_status, "idle");
  assert.equal(db.rows("activity").length, 2);
  assert.equal(db.rows("campaigns")[0].status, "active", "campaign status untouched");
});

test("bad action 400, not admin 403, unknown campaign 404", async () => {
  seed();
  const env = { ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN };
  assert.equal((await withEnv(env, () => call("delete"))).status, 400);
  assert.equal((await withEnv(env, () => call("pause", "nope"))).status, 404);
  seed("someone@example.com");
  assert.equal((await withEnv(env, () => call("pause"))).status, 403);
});
