// Behind the Funnel request.url is 127.0.0.1:3470: every browser redirect must use the public site URL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withEnv } from "./helpers/harness.ts";
const { publicOrigin, publicUrl, safeNextPath } = await import("../lib/site-url.ts");

test("redirects use NEXT_PUBLIC_SITE_URL, never the internal host", async () => {
  await withEnv({ NEXT_PUBLIC_SITE_URL: "https://nexride-aws.tail760678.ts.net:10000" }, async () => {
    assert.equal(publicOrigin("http://localhost:3470/marketing"), "https://nexride-aws.tail760678.ts.net:10000");
    assert.equal(publicUrl("/login", "http://127.0.0.1:3470/settings").href, "https://nexride-aws.tail760678.ts.net:10000/login");
  });
  await withEnv({ NEXT_PUBLIC_SITE_URL: undefined }, async () => {
    assert.equal(publicOrigin("http://localhost:3000/x"), "http://localhost:3000", "local dev falls back to the request");
  });
});

test("next= is same-site only (no open redirect)", () => {
  assert.equal(safeNextPath("/marketing?x=1"), "/marketing?x=1");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath(null), "/");
});
