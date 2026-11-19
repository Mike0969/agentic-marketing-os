import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { FakeSupabase } from "./helpers/fake-supabase.ts";
import { ENC_PREFIX, openToken, sealToken, tokenKey } from "../lib/social/token-crypto.ts";
import { loadConnection, saveConnection, updateConnectionTokens } from "../lib/social/connection-store.ts";

const ENV = { SOCIAL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
const CTX = { brandId: "b1", platform: "facebook", field: "access_token" as const };

test("seal/open round trip; random IV; prefix", () => {
  const a = sealToken("page-token-123", CTX, ENV)!;
  const b = sealToken("page-token-123", CTX, ENV)!;
  assert.ok(a.startsWith(ENC_PREFIX));
  assert.notEqual(a, b);
  assert.ok(!a.includes("page-token-123"));
  assert.equal(openToken(a, CTX, ENV), "page-token-123");
  assert.equal(sealToken(a, CTX, ENV), a, "already sealed values are not double-encrypted");
});

test("ciphertext is bound to its row and field", () => {
  const a = sealToken("tok", CTX, ENV)!;
  assert.throws(() => openToken(a, { ...CTX, brandId: "b2" }, ENV), /could not be decrypted/);
  assert.throws(() => openToken(a, { ...CTX, field: "refresh_token" }, ENV), /could not be decrypted/);
});

test("tampering, wrong key, missing key and malformed values are rejected", () => {
  const a = sealToken("tok", CTX, ENV)!;
  const parts = a.slice(ENC_PREFIX.length).split(".");
  const flipped = Buffer.from(parts[2], "base64url");
  flipped[0] ^= 1;
  assert.throws(() => openToken(`${ENC_PREFIX}${parts[0]}.${parts[1]}.${flipped.toString("base64url")}`, CTX, ENV));
  assert.throws(() => openToken(a, CTX, { SOCIAL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex") }));
  assert.throws(() => openToken(a, CTX, {}), /not set/);
  assert.throws(() => openToken(`${ENC_PREFIX}abc`, CTX, ENV), /malformed/);
  assert.throws(() => tokenKey({ SOCIAL_TOKEN_ENCRYPTION_KEY: "too-short" }), /32 bytes/);
});

test("backward compatible: no key stores plaintext; legacy plaintext reads as-is", () => {
  assert.equal(sealToken("plain", CTX, {}), "plain");
  assert.equal(openToken("legacy-plain", CTX, ENV), "legacy-plain");
  assert.equal(openToken(null, CTX, ENV), null);
});

test("saveConnection stores sealed tokens; loadConnection returns them decrypted", async () => {
  const db = new FakeSupabase();
  await saveConnection(db as never, { brand_id: "b1", platform: "facebook", access_token: "AT", refresh_token: null, author_urn: "page1", status: "connected" }, ENV);
  const row = db.rows("social_connections")[0];
  assert.ok(String(row.access_token).startsWith(ENC_PREFIX));
  assert.equal(row.tokens_encrypted, true);
  const loaded = await loadConnection(db as never, "b1", "facebook", ENV);
  assert.ok(loaded.ok);
  assert.equal(loaded.ok && loaded.conn?.access_token, "AT");
});

test("legacy plaintext row is re-encrypted in place on read", async () => {
  const db = new FakeSupabase({
    tables: { social_connections: [{ brand_id: "b1", platform: "linkedin", access_token: "OLD", refresh_token: "R", author_urn: "urn", status: "connected", expires_at: null, tokens_encrypted: false }] }
  });
  const loaded = await loadConnection(db as never, "b1", "linkedin", ENV);
  assert.equal(loaded.ok && loaded.conn?.access_token, "OLD");
  const row = db.rows("social_connections")[0];
  assert.ok(String(row.access_token).startsWith(ENC_PREFIX));
  assert.ok(String(row.refresh_token).startsWith(ENC_PREFIX));
  assert.equal(row.tokens_encrypted, true);
  const again = await loadConnection(db as never, "b1", "linkedin", ENV);
  assert.equal(again.ok && again.conn?.refresh_token, "R");
});

test("updateConnectionTokens seals refreshed tokens", async () => {
  const db = new FakeSupabase({ tables: { social_connections: [{ brand_id: "b1", platform: "x", access_token: "a", refresh_token: "r", status: "connected" }] } });
  await updateConnectionTokens(db as never, "b1", "x", { access_token: "new", refresh_token: "new-r", expires_at: "2030-01-01T00:00:00Z" }, ENV);
  const row = db.rows("social_connections")[0];
  assert.ok(String(row.access_token).startsWith(ENC_PREFIX));
  assert.equal(row.expires_at, "2030-01-01T00:00:00Z");
  const loaded = await loadConnection(db as never, "b1", "x", ENV);
  assert.equal(loaded.ok && loaded.conn?.access_token, "new");
});

test("an undecryptable token yields a clear error, not a crash", async () => {
  const db = new FakeSupabase();
  await saveConnection(db as never, { brand_id: "b1", platform: "facebook", access_token: "AT", refresh_token: null, status: "connected" }, ENV);
  const res = await loadConnection(db as never, "b1", "facebook", { SOCIAL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /reconnect/);
});
