import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const { chunkPlan, choosePrivacy, publishVideo } = await import("../lib/social/tiktok.ts");
const { publishApprovedPackage } = await import("../lib/social/posting.ts");
const { runDuePosts } = await import("../lib/marketing/schedule-runner.ts");

const MB = 1024 * 1024;
const noSleep = async () => {};

test("chunkPlan follows TikTok's chunk rules", () => {
  assert.deepEqual(chunkPlan(1000), { chunkSize: 1000, count: 1 });
  assert.deepEqual(chunkPlan(64 * MB), { chunkSize: 64 * MB, count: 1 });
  assert.deepEqual(chunkPlan(75 * MB), { chunkSize: 10 * MB, count: 7 });
  assert.throws(() => chunkPlan(0));
});

test("choosePrivacy prefers the configured level, else SELF_ONLY", () => {
  assert.equal(choosePrivacy(["PUBLIC_TO_EVERYONE", "SELF_ONLY"], "PUBLIC_TO_EVERYONE"), "PUBLIC_TO_EVERYONE");
  assert.equal(choosePrivacy(["PUBLIC_TO_EVERYONE", "SELF_ONLY"], undefined), "SELF_ONLY");
  assert.equal(choosePrivacy(["MUTUAL_FOLLOW_FRIENDS"], "PUBLIC_TO_EVERYONE"), "MUTUAL_FOLLOW_FRIENDS");
  assert.throws(() => choosePrivacy([], undefined));
});

function tiktok(size: number, statuses: Array<Record<string, unknown>>) {
  const puts: Array<{ range: string | null; len: number }> = [];
  let initBody: Record<string, unknown> | null = null;
  const f = fakeFetch(async (url, init) => {
    if (url === "https://cdn.example/video.mp4") return new Response(new Uint8Array(size), { headers: { "content-type": "video/mp4" } });
    if (url.endsWith("/creator_info/query/")) {
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer AT");
      return jsonResponse({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], creator_username: "brand" }, error: { code: "ok" } });
    }
    if (url.endsWith("/video/init/")) {
      initBody = JSON.parse(String(init.body));
      return jsonResponse({ data: { publish_id: "p-1", upload_url: "https://upload.example/u1" }, error: { code: "ok" } });
    }
    if (url === "https://upload.example/u1") {
      const h = new Headers(init.headers);
      puts.push({ range: h.get("content-range"), len: (init.body as Uint8Array).length });
      return new Response(null, { status: 201 });
    }
    if (url.endsWith("/status/fetch/")) return jsonResponse({ data: statuses.shift() ?? { status: "PROCESSING_UPLOAD" }, error: { code: "ok" } });
    return jsonResponse({}, 404);
  });
  return { f, puts, init: () => initBody };
}

test("publishVideo: creator_info -> init (FILE_UPLOAD) -> PUT -> poll until PUBLISH_COMPLETE", async () => {
  const t = tiktok(2048, [{ status: "PROCESSING_UPLOAD" }, { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7311] }]);
  const res = await withEnv({ TIKTOK_PRIVACY_LEVEL: undefined }, () => publishVideo("AT", "https://cdn.example/video.mp4", "caption", { sleep: noSleep }), t.f.fn);
  assert.deepEqual(res, { id: "7311", url: "https://www.tiktok.com/@brand/video/7311", status: "published", publishId: "p-1" });
  const init = t.init()!;
  assert.deepEqual(init.source_info, { source: "FILE_UPLOAD", video_size: 2048, chunk_size: 2048, total_chunk_count: 1 });
  assert.equal((init.post_info as Record<string, unknown>).privacy_level, "SELF_ONLY");
  assert.deepEqual(t.puts, [{ range: "bytes 0-2047/2048", len: 2048 }]);
});

test("publishVideo: multi-chunk ranges", async () => {
  const size = 75 * MB + 123;
  const t = tiktok(size, [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [1] }]);
  await withEnv({}, () => publishVideo("AT", "https://cdn.example/video.mp4", "c", { sleep: noSleep }), t.f.fn);
  assert.equal(t.puts.length, 7);
  assert.equal(t.puts[0].range, `bytes 0-${10 * MB - 1}/${size}`);
  assert.equal(t.puts[6].range, `bytes ${60 * MB}-${size - 1}/${size}`);
  assert.equal(t.puts.reduce((n, p) => n + p.len, 0), size);
});

test("publishVideo: FAILED throws; still processing after the poll budget returns processing", async () => {
  const failed = tiktok(10, [{ status: "FAILED", fail_reason: "duration_check" }]);
  await assert.rejects(withEnv({}, () => publishVideo("AT", "https://cdn.example/video.mp4", "c", { sleep: noSleep }), failed.f.fn), /duration_check/);
  const slow = tiktok(10, []);
  const res = await withEnv({}, () => publishVideo("AT", "https://cdn.example/video.mp4", "c", { sleep: noSleep, pollAttempts: 2 }), slow.f.fn);
  assert.equal(res.status, "processing");
  assert.equal(res.publishId, "p-1");
});

const BRAND = "22222222-2222-4222-8222-222222222222";
function postingDb(items: Array<Record<string, unknown>>) {
  return new FakeSupabase({
    tables: {
      content_items: items,
      social_connections: [
        { brand_id: BRAND, platform: "tiktok", access_token: "AT", refresh_token: "RT", expires_at: new Date(Date.now() + 3600_000).toISOString(), author_urn: "open-1", status: "connected" }
      ],
      agent_runs: []
    }
  });
}
const item = (id: string, pkg: Record<string, unknown>) => ({
  id,
  brand_id: BRAND,
  platform: "TikTok",
  title: id,
  body: "body",
  status: "scheduled",
  scheduled_at: new Date(Date.now() - 60_000).toISOString(),
  archived_at: null,
  ready_package: { text: "caption", ...pkg }
});
const POST_ENV = { ...SUPABASE_ENV, SOCIAL_POSTING_ENABLED: "true", SOCIAL_TOKEN_ENCRYPTION_KEY: undefined };

test("posting: a TikTok text/image item is marked unsupported without any network call", async () => {
  holder.db = postingDb([item("text-only", {})]);
  const res = await withEnv(POST_ENV, () => publishApprovedPackage("text-only"));
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /video asset/);
  const row = holder.db.rows("content_items")[0];
  assert.equal(row.status, "scheduled");
  assert.equal((row.ready_package as Record<string, unknown>).posting_status, "unsupported");
});

test("posting: a TikTok item with a generated video asset publishes via the Content Posting API", async () => {
  holder.db = postingDb([item("vid", { assets: [{ kind: "video_placeholder", url: "https://cdn.example/video.mp4", status: "generated" }] })]);
  const t = tiktok(4096, [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [99] }]);
  const res = await withEnv(POST_ENV, () => publishApprovedPackage("vid"), t.f.fn);
  assert.equal(res.ok, true);
  const row = holder.db.rows("content_items")[0];
  assert.equal(row.status, "published");
  const pkg = row.ready_package as Record<string, unknown>;
  assert.equal(pkg.posting_status, "published");
  assert.equal(pkg.tiktok_publish_id, "p-1");
  assert.equal(pkg.posted_url, "https://www.tiktok.com/@brand/video/99");
});

test("schedule runner: unsupported items are skipped and one failure never stops the batch", async () => {
  holder.db = postingDb([
    item("a-unsupported", { posting_status: "unsupported" }),
    item("b-text", {}),
    item("c-vid", { assets: [{ kind: "video_placeholder", url: "https://cdn.example/video.mp4", status: "generated" }] })
  ]);
  const t = tiktok(4096, [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [5] }]);
  const res = await withEnv(POST_ENV, () => runDuePosts(5), t.f.fn);
  assert.equal(res.attempted, 2, "the already-unsupported item is not retried");
  assert.equal(res.posted, 1);
  const byId = Object.fromEntries(holder.db.rows("content_items").map((r) => [r.id, r]));
  assert.equal(byId["c-vid"].status, "published");
  assert.equal((byId["b-text"].ready_package as Record<string, unknown>).posting_status, "unsupported");
});
