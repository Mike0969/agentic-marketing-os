// App-level encryption for social OAuth tokens at rest (AES-256-GCM).
// Stored form: "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). The additional data binds a
// ciphertext to its row and field, so a token copied into another row does not decrypt.
// Backward compatible: values without the prefix are legacy plaintext and are returned as-is.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

type Env = Record<string, string | undefined>;

export const ENC_PREFIX = "enc:v1:";
export const TOKEN_KEY_ENV = "SOCIAL_TOKEN_ENCRYPTION_KEY";

/** Parses the 32-byte key (base64 or 64 hex chars). Returns null when unset; throws when malformed. */
export function tokenKey(env: Env = process.env): Buffer | null {
  const raw = env[TOKEN_KEY_ENV]?.trim();
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${TOKEN_KEY_ENV} must be 32 bytes (base64, or 64 hex characters).`);
  return key;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

export type TokenContext = { brandId: string; platform: string; field: "access_token" | "refresh_token" | "api_key" | "bot_token" };

function aad(ctx: TokenContext) {
  return Buffer.from(`social_connections|${ctx.brandId}|${ctx.platform}|${ctx.field}`, "utf8");
}

/** Encrypts when a key is configured; without a key the value is stored as before (plaintext). */
export function sealToken(value: string | null | undefined, ctx: TokenContext, env: Env = process.env): string | null {
  if (value == null || value === "") return value ?? null;
  if (isEncrypted(value)) return value;
  const key = tokenKey(env);
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(ctx));
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

/** Decrypts an "enc:v1:" value; legacy plaintext passes through. Throws on a wrong key or tampering. */
export function openToken(value: string | null | undefined, ctx: TokenContext, env: Env = process.env): string | null {
  if (value == null || value === "") return value ?? null;
  if (!isEncrypted(value)) return value;
  const key = tokenKey(env);
  if (!key) throw new Error(`Stored ${ctx.platform} token is encrypted but ${TOKEN_KEY_ENV} is not set.`);
  const [ivB, tagB, ctB, extra] = value.slice(ENC_PREFIX.length).split(".");
  if (!ivB || !tagB || ctB === undefined || extra !== undefined) throw new Error(`Stored ${ctx.platform} token is malformed.`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64url"));
    decipher.setAAD(aad(ctx));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(`Stored ${ctx.platform} token could not be decrypted (wrong key or altered value); reconnect the account.`);
  }
}
