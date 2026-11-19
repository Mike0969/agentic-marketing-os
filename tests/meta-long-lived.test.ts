import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const fb = await import("../lib/social/facebook.ts");
const ig = await import("../lib/social/instagram.ts");
const { handleSocialOAuthCallback } = await import("../lib/social/oauth-routes.ts");
const { connectionView } = await import("../lib/social/connection-status.ts");

const FB_ENV = { FACEBOOK_CLIENT_ID: "app1", FACEBOOK_CLIENT_SECRET: "sec1", INSTAGRAM_CLIENT_ID: "app2", INSTAGRAM_CLIENT_SECRET: "sec2" };
const EXP = 1_900_000_000; // 2030-03-17

function meta(opts: { debugExpiresAt?: number; debugFails?: boolean; ig?: boolean } = {}) {
  return fakeFetch((url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/oauth/access_token") && u.searchParams.get("code")) return jsonResponse({ access_token: "SHORT", expires_in: 3600, scope: "pages_manage_posts" });
    if (u.pathname.endsWith("/oauth/access_token") && u.searchParams.get("grant_type") === "fb_exchange_token") {
      assert.equal(u.searchParams.get("fb_exchange_token"), "SHORT");
      return jsonResponse({ access_token: "LONG_USER", token_type: "bearer", expires_in: 5_183_944 });
    }
    if (u.pathname.endsWith("/me/accounts")) {
      assert.equal(u.searchParams.get("access_token"), "LONG_USER", "pages must be read with the long-lived user token");
      return jsonResponse({ data: [{ id: "page1", name: "Page", access_token: "PAGE_TOKEN", instagram_business_account: opts.ig ? { id: "ig1", username: "brand" } : undefined }] });
    }
    if (u.pathname.endsWith("/debug_token")) {
      if (opts.debugFails) return jsonResponse({ error: { message: "nope" } }, 500);
      assert.equal(u.searchParams.get("input_token"), "PAGE_TOKEN");
      return jsonResponse({ data: { is_valid: true, expires_at: opts.debugExpiresAt ?? 0 } });
    }
    return jsonResponse({ error: "unexpected" }, 404);
  });
}

test("facebook exchangeCode swaps the short-lived token for a long-lived one", async () => {
  const f = meta();
  const tok = await withEnv(FB_ENV, () => fb.exchangeCode("CODE"), f.fn);
  assert.equal(tok.access_token, "LONG_USER");
  assert.equal(tok.expires_in, 5_183_944);
  assert.equal(f.calls.length, 2);
});

test("facebook page token: never-expiring -> expiresAt null; dated -> real ISO expiry", async () => {
  const never = await withEnv(FB_ENV, () => fb.resolveAccount("LONG_USER"), meta({ debugExpiresAt: 0 }).fn);
  assert.equal(never.accessToken, "PAGE_TOKEN");
  assert.equal(never.expiresAt, null);
  const dated = await withEnv(FB_ENV, () => fb.resolveAccount("LONG_USER"), meta({ debugExpiresAt: EXP }).fn);
  assert.equal(dated.expiresAt, new Date(EXP * 1000).toISOString());
});

test("debug_token failure falls back to a conservative ~60 day expiry (never 'forever')", async () => {
  const r = await withEnv(FB_ENV, () => fb.resolveAccount("LONG_USER"), meta({ debugFails: true }).fn);
  const days = (new Date(r.expiresAt!).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 59 && days < 61, String(days));
});

test("instagram uses the same long-lived flow", async () => {
  const f = meta({ ig: true, debugExpiresAt: EXP });
  const r = await withEnv(FB_ENV, async () => ig.resolveAccount((await ig.exchangeCode("CODE")).access_token), f.fn);
  assert.equal(r.accountId, "ig1");
  assert.equal(r.accessToken, "PAGE_TOKEN");
  assert.equal(r.expiresAt, new Date(EXP * 1000).toISOString());
});

test("OAuth callback stores the long-lived Page token with its real expiry", async () => {
  const db = new FakeSupabase();
  holder.db = db;
  const brand = "11111111-1111-4111-8111-111111111111";
  const state = `v1.${brand}.${Date.now()}.nonce.sig`;
  const req = new Request(`https://os.example/api/auth/facebook/callback?code=CODE&state=${encodeURIComponent(state)}`, {
    headers: { cookie: `facebook_oauth_state=${encodeURIComponent(state)}` }
  });
  const res = await withEnv({ ...SUPABASE_ENV, ...FB_ENV, SOCIAL_TOKEN_ENCRYPTION_KEY: undefined }, () =>
    handleSocialOAuthCallback(req, { platform: "facebook", exchangeCode: fb.exchangeCode, resolveAccount: fb.resolveAccount }), meta({ debugExpiresAt: EXP }).fn);
  assert.match(res.headers.get("location") ?? "", /facebook=connected/);
  const row = db.rows("social_connections")[0];
  assert.equal(row.access_token, "PAGE_TOKEN");
  assert.equal(row.author_urn, "page1");
  assert.equal(row.expires_at, new Date(EXP * 1000).toISOString());
});

test("connectionView shows expired only when it really is", () => {
  const now = Date.parse("2026-11-19T00:00:00Z");
  assert.equal(connectionView(null, now), "not connected");
  assert.equal(connectionView({ status: "connected", expires_at: null, has_refresh_token: false }, now), "connected");
  assert.equal(connectionView({ status: "connected", expires_at: "2026-11-18T23:59:00Z", has_refresh_token: false }, now), "expired");
  assert.equal(connectionView({ status: "connected", expires_at: "2026-11-18T23:59:00Z", has_refresh_token: true }, now), "connected");
  assert.equal(connectionView({ status: "connected", expires_at: "2026-11-22T00:00:00Z", has_refresh_token: false }, now), "expiring");
  assert.equal(connectionView({ status: "connected", expires_at: "2027-01-30T00:00:00Z", has_refresh_token: false }, now), "connected");
  assert.equal(connectionView({ status: "expired", expires_at: null, has_refresh_token: true }, now), "expired");
  assert.equal(connectionView({ status: "revoked", expires_at: null, has_refresh_token: false }, now), "revoked");
});
