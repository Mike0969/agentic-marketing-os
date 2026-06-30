const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USERINFO_URL = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name";
export const TIKTOK_SCOPES = "user.info.basic,video.publish";

export function tiktokConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_ID && process.env.TIKTOK_CLIENT_SECRET);
}

export function tiktokRedirectUri() {
  return process.env.TIKTOK_REDIRECT_URI || "http://localhost:3000/api/auth/tiktok/callback";
}

export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_ID ?? "",
    redirect_uri: tiktokRedirectUri(),
    state,
    scope: TIKTOK_SCOPES,
    response_type: "code"
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type TikTokToken = { access_token: string; expires_in?: number; refresh_token?: string; scope?: string };

export async function exchangeCode(code: string): Promise<TikTokToken> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_ID ?? "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: tiktokRedirectUri()
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`TikTok token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as TikTokToken;
}

export async function resolveAccount(accessToken: string): Promise<{ accountId: string; handle: string | null }> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`TikTok user lookup failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { user?: { open_id?: string; display_name?: string } } };
  const user = json.data?.user;
  if (!user?.open_id) throw new Error("TikTok user lookup returned no open_id.");
  return { accountId: user.open_id, handle: user.display_name ?? null };
}

export async function publishPost(_accessToken: string, _accountId: string, _text: string, _imageUrl?: string | null): Promise<{ id: string | null; url: string | null }> {
  throw new Error("TikTok Content Posting API is video-only; text/image posting is not supported by this connector yet.");
}
