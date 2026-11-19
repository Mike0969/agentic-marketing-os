import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const { chunkPlan, choosePrivacy, publishVideo } = await import("../lib/social/tiktok.ts");
const { publishApprovedPackage, reconcileProcessingPosts } = await import("../lib/social/posting.ts");
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

function tiktok(size: number, statuses: Array<Record<string, unknown>>, token = "AT") {
  const puts: Array<{ range: string | null; len: number }> = [];
  let initBody: Record<string, unknown> | null = null;
  const f = fakeFetch(async (url, init) => {
    if (url === "https://cdn.example/video.mp4") return new Response(new Uint8Array(size), { headers: { "content-type": "video/mp4" } });
    if (url.endsWith("/creator_info/query/")) {
      assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
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
const soon = () => new Date(Date.now() + 3600_000).toISOString();
function postingDb(items: Array<Record<string, unknown>>, conn: Record<string, unknown> = {}) {
  return new FakeSupabase({
    tables: {
      content_items: items,
      social_connections: [
        { brand_id: BRAND, platform: "tiktok", access_token: "AT", refresh_token: "RT", expires_at: soon(), author_urn: "open-1", scopes: null, status: "connected", ...conn }
      ],
      agent_runs: []
    }
  });
}
const VIDEO = { assets: [{ kind: "video_placeholder", url: "https://cdn.example/video.mp4", status: "generated" }] };
const item = (id: string, pkg: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id,
  brand_id: BRAND,
  platform: "TikTok",
  title: id,
  body: "body",
  status: "scheduled",
  posting_status: "pending",
  posting_ref: null,
  scheduled_at: new Date(Date.now() - 60_000).toISOString(),
  archived_at: null,
  ready_package: { text: "caption", ...pkg },
  ...extra
});
const POST_ENV = { ...SUPABASE_ENV, SOCIAL_POSTING_ENABLED: "true", SOCIAL_TOKEN_ENCRYPTION_KEY: undefined };
const row = (id: string) => holder.db!.rows("content_items").find((r) => r.id === id)!;

test("posting: a TikTok text/image item is marked unsupported without any network call", async () => {
  holder.db = postingDb([item("text-only", {})]);
  const res = await withEnv(POST_ENV, () => publishApprovedPackage("text-only"));
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /video asset/);
  assert.equal(row("text-only").status, "scheduled");
  assert.equal(row("text-only").posting_status, "unsupported");
});

test("posting: a TikTok video that completes is published with its publish_id", async () => {
  holder.db = postingDb([item("vid", VIDEO)]);
  const t = tiktok(4096, [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [99] }]);
  const res = await withEnv(POST_ENV, () => publishApprovedPackage("vid"), t.f.fn);
  assert.equal(res.ok, true);
  assert.equal(row("vid").status, "published");
  assert.equal(row("vid").posting_status, "published");
  assert.equal(row("vid").posting_ref, "p-1");
  assert.equal((row("vid").ready_package as Record<string, unknown>).posted_url, "https://www.tiktok.com/@brand/video/99");
});

test("posting: a TikTok upload still processing is NOT published; it is never posted twice", async () => {
  holder.db = postingDb([item("slow", VIDEO)]);
  const t = tiktok(4096, []);
  const res = await withEnv(POST_ENV, () => publishApprovedPackage("slow"), t.f.fn);
  assert.equal(res.ok, true);
  assert.equal(row("slow").status, "scheduled");
  assert.equal(row("slow").posting_status, "processing");
  assert.equal(row("slow").posting_ref, "p-1");
  assert.equal(row("slow").published_at, undefined);
  const again = await withEnv(POST_ENV, () => publishApprovedPackage("slow"));
  assert.equal(again.ok, false);
  assert.match(!again.ok ? again.error : "", /already processing/);
});

function statusOnly(status: Record<string, unknown> | "error") {
  return fakeFetch((url) => {
    assert.ok(url.endsWith("/status/fetch/"), url);
    return status === "error" ? jsonResponse({ error: { code: "internal_error", message: "x" } }, 500) : jsonResponse({ data: status, error: { code: "ok" } });
  });
}
const processingItem = (id: string) => item(id, VIDEO, { posting_status: "processing", posting_ref: `pub-${id}` });

test("cron reconcile: processing -> published / failed; still processing or lookup error -> unchanged", async () => {
  for (const [st, expectStatus, expectPosting] of [
    [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [1] }, "published", "published"],
    [{ status: "FAILED", fail_reason: "spam_risk" }, "scheduled", "failed"],
    [{ status: "PROCESSING_DOWNLOAD" }, "scheduled", "processing"],
    ["error", "scheduled", "processing"]
  ] as const) {
    holder.db = postingDb([processingItem("p")]);
    const f = statusOnly(st);
    await withEnv(POST_ENV, () => reconcileProcessingPosts(), f.fn);
    assert.equal(row("p").status, expectStatus, JSON.stringify(st));
    assert.equal(row("p").posting_status, expectPosting, JSON.stringify(st));
    if (expectPosting === "failed") assert.match(String((row("p").ready_package as Record<string, unknown>).posting_error), /spam_risk/);
  }
});

test("TikTok refresh: an expiring token is refreshed, rotated through encrypted storage, and used", async () => {
  const KEY = { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  const { sealToken, openToken, ENC_PREFIX } = await import("../lib/social/token-crypto.ts");
  const ctx = (field: "access_token" | "refresh_token") => ({ brandId: BRAND, platform: "tiktok", field });
  holder.db = postingDb([item("vid", VIDEO)], {
    access_token: sealToken("OLD_AT", ctx("access_token"), KEY),
    refresh_token: sealToken("OLD_RT", ctx("refresh_token"), KEY),
    expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  const t = tiktok(4096, [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [3] }], "NEW_AT");
  let refreshed = false;
  const f = fakeFetch(async (url, init) => {
    if (url === "https://open.tiktokapis.com/v2/oauth/token/") {
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("refresh_token"), "OLD_RT");
      refreshed = true;
      return jsonResponse({ access_token: "NEW_AT", refresh_token: "NEW_RT", expires_in: 86400 });
    }
    if (url.startsWith("https://open.tiktokapis.com/v2/post/publish/")) assert.equal(new Headers(init.headers).get("authorization"), "Bearer NEW_AT");
    return t.f.fn(url, init);
  });
  const res = await withEnv({ ...POST_ENV, ...KEY }, () => publishApprovedPackage("vid"), f.fn);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(refreshed);
  const conn = holder.db!.rows("social_connections")[0];
  assert.ok(String(conn.access_token).startsWith(ENC_PREFIX) && String(conn.refresh_token).startsWith(ENC_PREFIX));
  assert.equal(openToken(String(conn.access_token), ctx("access_token"), KEY), "NEW_AT");
  assert.equal(openToken(String(conn.refresh_token), ctx("refresh_token"), KEY), "NEW_RT");
  assert.ok(Date.parse(String(conn.expires_at)) > Date.now() + 80_000_000);
});

test("schedule runner: unsupported/processed/non-social rows never starve the queue; one failure never stops the batch", async () => {
  const old = (n: number) => new Date(Date.now() - 86_400_000 - n * 1000).toISOString();
  const blockers = [
    ...Array.from({ length: 30 }, (_, n) => item(`u${n}`, {}, { posting_status: "unsupported", scheduled_at: old(n) })),
    ...Array.from({ length: 70 }, (_, n) => item(`blog${n}`, {}, { platform: "Blog", scheduled_at: old(100 + n) }))
  ];
  holder.db = postingDb([...blockers, item("b-text", {}), item("c-vid", VIDEO)]);
  const t = tiktok(4096, [{ status: "PUBLISH_COMPLETE", publicaly_available_post_id: [5] }]);
  const res = await withEnv(POST_ENV, () => runDuePosts(5), t.f.fn);
  assert.equal(res.attempted, 2, "reaches the two real candidates past 100 older blockers");
  assert.equal(res.posted, 1);
  assert.equal(row("c-vid").status, "published");
  assert.equal(row("b-text").posting_status, "unsupported");
});
