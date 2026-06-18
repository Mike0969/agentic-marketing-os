import { readFile } from "fs/promises";
import { createSign } from "crypto";

/**
 * Durable Google service-account auth (no npm dependency).
 *
 * Mints a read-only access token by signing a JWT (RS256) with the service
 * account private key and exchanging it at Google's token endpoint. Tokens are
 * cached in-memory until shortly before expiry, so no manual refresh is needed.
 *
 * The service account must be added as a USER on each Search Console property
 * (Settings → Users and permissions → add the service-account email, read access).
 *
 * Credentials are server-only. Sources (per-brand first, then shared):
 *   GOOGLE_APPLICATION_CREDENTIALS[_<BRAND>]  → path to the SA JSON key file
 *   GOOGLE_SERVICE_ACCOUNT_KEY[_<BRAND>]      → the SA JSON key as an inline string
 */

export type ServiceAccount = { client_email: string; private_key: string };

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 10000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function loadServiceAccount(brandKey?: string | null): Promise<ServiceAccount | null> {
  const inline = (brandKey ? process.env[`GOOGLE_SERVICE_ACCOUNT_KEY_${brandKey}`] : "") || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
  const path = (brandKey ? process.env[`GOOGLE_APPLICATION_CREDENTIALS_${brandKey}`] : "") || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";

  try {
    let raw = inline;
    if (!raw && path) raw = await readFile(path, "utf8");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    }
    return null;
  } catch {
    return null;
  }
}

/** True if a service account is configured (per-brand or shared). Cheap env check. */
export function hasServiceAccountEnv(brandKey?: string | null): boolean {
  const perBrand = brandKey ? process.env[`GOOGLE_SERVICE_ACCOUNT_KEY_${brandKey}`] || process.env[`GOOGLE_APPLICATION_CREDENTIALS_${brandKey}`] : "";
  return Boolean(perBrand || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

/** Mint (or reuse a cached) read-only access token for the service account. */
export async function getServiceAccountToken(brandKey?: string | null): Promise<string | null> {
  const sa = await loadServiceAccount(brandKey);
  if (!sa) return null;

  const now = Date.now();
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const signingInput = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp }))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const assertion = `${signingInput}.${base64url(signer.sign(sa.private_key))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`Service-account token exchange returned HTTP ${response.status}.`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Token exchange did not return an access_token.");

  tokenCache.set(sa.client_email, { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}
