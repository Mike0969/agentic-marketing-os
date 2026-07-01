import { createHash, randomBytes } from "node:crypto";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";
const TWEETS_URL = "https://api.x.com/2/tweets";
const MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
export const X_SCOPES = "tweet.write users.read offline.access";

export function xConfigured() {
  return Boolean(process.env.X_CLIENT_ID);
}

export function xRedirectUri() {
  return process.env.X_REDIRECT_URI || "http://localhost:3000/api/auth/x/callback";
}

export function createCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function getAuthorizeUrl(state: string, verifier: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID ?? "",
    redirect_uri: xRedirectUri(),
    state,
    scope: X_SCOPES,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256"
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type XToken = { access_token: string; expires_in?: number; refresh_token?: string; scope?: string };

export async function exchangeCode(code: string, verifier: string): Promise<XToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: xRedirectUri(),
    client_id: process.env.X_CLIENT_ID ?? "",
    code_verifier: verifier
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`;
  }
  const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`X token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as XToken;
}

export async function refreshToken(refreshToken: string): Promise<XToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.X_CLIENT_ID ?? ""
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`;
  }
  const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`X token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as XToken;
}

export async function resolveAccount(accessToken: string): Promise<{ accountId: string; handle: string | null }> {
  const res = await fetch(ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`X user lookup failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { id?: string; username?: string; name?: string } };
  if (!json.data?.id) throw new Error("X user lookup returned no account id.");
  return { accountId: json.data.id, handle: json.data.username ?? json.data.name ?? null };
}

async function uploadImage(accessToken: string, imageUrl: string): Promise<string> {
  const image = await fetch(imageUrl);
  if (!image.ok) throw new Error(`Could not fetch X image (${image.status}).`);
  const blob = new Blob([await image.arrayBuffer()], { type: image.headers.get("content-type") || "image/jpeg" });
  const form = new FormData();
  form.set("media", blob, "image");

  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  if (!res.ok) throw new Error(`X media upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { media_id_string?: string; media_id?: number | string };
  const mediaId = json.media_id_string ?? (json.media_id != null ? String(json.media_id) : "");
  if (!mediaId) throw new Error("X media upload returned no media id.");
  return mediaId;
}

export async function publishPost(accessToken: string, _accountId: string, text: string, imageUrl?: string | null): Promise<{ id: string | null; url: string | null }> {
  const mediaIds = imageUrl ? [await uploadImage(accessToken, imageUrl)] : [];
  const body: Record<string, unknown> = { text: text.slice(0, 280) };
  if (mediaIds.length) body.media = { media_ids: mediaIds };
  const res = await fetch(TWEETS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`X post failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json.data?.id ?? null;
  return { id, url: id ? `https://x.com/i/web/status/${id}` : null };
}
