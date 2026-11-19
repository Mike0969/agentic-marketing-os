import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, fakeFetch, jsonResponse } from "./helpers/fake-supabase.ts";
import { SUPABASE_ENV, mockServiceClient, withEnv } from "./helpers/harness.ts";

const holder = mockServiceClient();
const { getAuthorizeUrl, linkedinAuthor } = await import("../lib/social/linkedin.ts");
const { publishApprovedPackage } = await import("../lib/social/posting.ts");

const ORG = "urn:li:organization:4242";
const MEMBER = "urn:li:person:abc";

test("linkedinAuthor: member by default, organization when configured and granted", () => {
  assert.deepEqual(linkedinAuthor({ memberUrn: MEMBER, organizationUrn: null, scopes: "openid w_member_social" }), { ok: true, author: MEMBER, asOrganization: false });
  assert.deepEqual(linkedinAuthor({ memberUrn: MEMBER, organizationUrn: ORG, scopes: "openid w_member_social w_organization_social" }), { ok: true, author: ORG, asOrganization: true });
  assert.deepEqual(linkedinAuthor({ memberUrn: MEMBER, organizationUrn: ORG, scopes: "openid,w_member_social,w_organization_social" }).ok, true);
  const missing = linkedinAuthor({ memberUrn: MEMBER, organizationUrn: ORG, scopes: "openid w_member_social" });
  assert.equal(missing.ok, false);
  assert.match(!missing.ok ? missing.error : "", /w_organization_social/);
  assert.equal(linkedinAuthor({ memberUrn: MEMBER, organizationUrn: "urn:li:company:1", scopes: null }).ok, false);
});

test("authorize URL asks for w_organization_social only for organization brands", () => {
  const plain = new URL(getAuthorizeUrl("s")).searchParams.get("scope")!;
  const org = new URL(getAuthorizeUrl("s", { organization: true })).searchParams.get("scope")!;
  assert.ok(!plain.includes("w_organization_social"));
  assert.ok(org.split(" ").includes("w_organization_social"));
  assert.ok(org.split(" ").includes("w_member_social"));
});

const BRAND = "33333333-3333-4333-8333-333333333333";
function db(orgUrn: string | null, scopes: string) {
  return new FakeSupabase({
    tables: {
      brands: [{ id: BRAND, name: "B", linkedin_organization_urn: orgUrn }],
      content_items: [
        { id: "li-1", brand_id: BRAND, platform: "LinkedIn", title: "t", body: "hello", status: "scheduled", visual_asset_url: "https://cdn.example/img.png", ready_package: { text: "hello" } }
      ],
      social_connections: [{ brand_id: BRAND, platform: "linkedin", access_token: "AT", refresh_token: null, expires_at: null, author_urn: MEMBER, scopes, status: "connected" }]
    }
  });
}

function linkedinApi() {
  const seen: { postAuthor?: string; imageOwner?: string } = {};
  const f = fakeFetch((url, init) => {
    if (url.startsWith("https://api.linkedin.com/rest/images")) {
      seen.imageOwner = JSON.parse(String(init.body)).initializeUploadRequest.owner;
      return jsonResponse({ value: { uploadUrl: "https://upload.linkedin.example/1", image: "urn:li:image:1" } });
    }
    if (url === "https://cdn.example/img.png") return new Response(new Uint8Array([1, 2, 3]));
    if (url === "https://upload.linkedin.example/1") return new Response(null, { status: 201 });
    if (url === "https://api.linkedin.com/rest/posts") {
      seen.postAuthor = JSON.parse(String(init.body)).author;
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
    }
    return jsonResponse({}, 404);
  });
  return { f, seen };
}
const ENV = { ...SUPABASE_ENV, SOCIAL_POSTING_ENABLED: "true", SOCIAL_TOKEN_ENCRYPTION_KEY: undefined };

test("posting: organization brand posts (and uploads the image) as the Company Page", async () => {
  holder.db = db(ORG, "openid profile w_member_social w_organization_social");
  const api = linkedinApi();
  const res = await withEnv(ENV, () => publishApprovedPackage("li-1"), api.f.fn);
  assert.equal(res.ok, true);
  assert.equal(api.seen.postAuthor, ORG);
  assert.equal(api.seen.imageOwner, ORG);
});

test("posting: brand without an organization posts as the member (unchanged)", async () => {
  holder.db = db(null, "openid profile w_member_social");
  const api = linkedinApi();
  const res = await withEnv(ENV, () => publishApprovedPackage("li-1"), api.f.fn);
  assert.equal(res.ok, true);
  assert.equal(api.seen.postAuthor, MEMBER);
});

test("posting: organization brand without the org scope fails clearly and calls nothing", async () => {
  holder.db = db(ORG, "openid profile w_member_social");
  const res = await withEnv(ENV, () => publishApprovedPackage("li-1"));
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /reconnect LinkedIn/);
  assert.equal(holder.db.rows("content_items")[0].status, "scheduled");
});

test("LinkedIn start route requests the org scope for an organization brand", async () => {
  holder.db = db(ORG, "");
  const route = await import("../app/api/auth/linkedin/start/route.ts");
  const res = await withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined, LINKEDIN_CLIENT_ID: "cid", LINKEDIN_CLIENT_SECRET: "cs" }, () =>
    route.GET(new Request(`https://os.example/api/auth/linkedin/start?brand_id=${BRAND}`))
  );
  assert.equal(res.status, 307);
  const scope = new URL(res.headers.get("location")!).searchParams.get("scope")!;
  assert.ok(scope.split(" ").includes("w_organization_social"));
});

test("brand PATCH rejects a malformed organization URN", async () => {
  const route = await import("../app/api/marketing/brands/[id]/route.ts");
  const res = await withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, () =>
    route.PATCH(new Request("https://os.example/api/marketing/brands/x", { method: "PATCH", body: JSON.stringify({ linkedin_organization_urn: "https://linkedin.com/company/x" }) }), {
      params: Promise.resolve({ id: BRAND })
    })
  );
  assert.equal(res.status, 400);
});
