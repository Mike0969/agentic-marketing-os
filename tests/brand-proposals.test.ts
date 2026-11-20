// Brand field proposals: Save closes only the proposals the operator used or dismissed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const brandRoute = await import("../app/api/marketing/brands/[id]/route.ts");

const ADMIN = "admin@example.com";
const BRAND = "44444444-4444-4444-8444-444444444444";
const ENV = { ...SUPABASE_ENV, ADMIN_EMAIL: ADMIN };

function seed() {
  const db = new FakeSupabase({
    tables: {
      brands: [{ id: BRAND, name: "NexRide", positioning: "TEST BRAND - placeholder" }],
      brand_field_proposals: [
        { id: "p1", brand_id: BRAND, field: "positioning", value: "Community-owned mobility", source: "soul.md", status: "proposed" },
        { id: "p2", brand_id: BRAND, field: "offers", value: "Zero commission", source: "soul.md", status: "proposed" },
        { id: "p3", brand_id: BRAND, field: "competitors", value: "Uber", source: "soul.md", status: "proposed" }
      ],
      activity: []
    }
  });
  db.user = { email: ADMIN };
  holder.db = db;
  return db;
}

const patch = (body: Record<string, unknown>) =>
  brandRoute.PATCH(new Request(`https://os.example/api/marketing/brands/${BRAND}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: BRAND }) });

test("Save marks used proposals accepted and dismissed ones dismissed; others stay open", async () => {
  const db = seed();
  const res = await withEnv(ENV, () =>
    patch({ positioning: "Community-owned mobility", accepted_proposals: ["positioning", "not_a_field"], dismissed_proposals: ["offers"] })
  );
  assert.equal(res.status, 200);
  const byId = Object.fromEntries(db.rows("brand_field_proposals").map((row) => [row.id, row]));
  assert.equal(byId.p1.status, "accepted");
  assert.equal(byId.p2.status, "dismissed");
  assert.equal(byId.p3.status, "proposed");
  assert.ok(byId.p1.decided_at);
  assert.equal(db.rows("brands")[0].positioning, "Community-owned mobility");
});

test("a plain Save leaves every proposal open", async () => {
  const db = seed();
  assert.equal((await withEnv(ENV, () => patch({ name: "NexRide" }))).status, 200);
  assert.ok(db.rows("brand_field_proposals").every((row) => row.status === "proposed"));
});
