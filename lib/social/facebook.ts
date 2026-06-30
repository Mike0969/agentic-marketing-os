const AUTH_URL = "https://www.facebook.com/v20.0/dialog/oauth";
const TOKEN_URL = "https://graph.facebook.com/v20.0/oauth/access_token";
const GRAPH_URL = "https://graph.facebook.com/v20.0";
export const FACEBOOK_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts";

export function facebookConfigured() {
  return Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
}

export function facebookRedirectUri() {
  return process.env.FACEBOOK_REDIRECT_URI || "http://localhost:3000/api/auth/facebook/callback";
}

export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID ?? "",
    redirect_uri: facebookRedirectUri(),
    state,
    scope: FACEBOOK_SCOPES,
    response_type: "code"
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type FacebookToken = { access_token: string; expires_in?: number; scope?: string };

export async function exchangeCode(code: string): Promise<FacebookToken> {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID ?? "",
    client_secret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    redirect_uri: facebookRedirectUri(),
    code
  });
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Facebook token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as FacebookToken;
}

export async function resolveAccount(accessToken: string): Promise<{ accountId: string; handle: string | null; accessToken: string }> {
  const params = new URLSearchParams({ access_token: accessToken, fields: "id,name,access_token" });
  const res = await fetch(`${GRAPH_URL}/me/accounts?${params.toString()}`);
  if (!res.ok) throw new Error(`Facebook Page lookup failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Array<{ id?: string; name?: string; access_token?: string }> };
  const page = json.data?.find((p) => p.id && p.access_token);
  if (!page?.id || !page.access_token) throw new Error("No manageable Facebook Page found for this account.");
  return { accountId: page.id, handle: page.name ?? null, accessToken: page.access_token };
}

export async function publishPost(accessToken: string, pageId: string, text: string, imageUrl?: string | null): Promise<{ id: string | null; url: string | null }> {
  const endpoint = imageUrl ? `${GRAPH_URL}/${pageId}/photos` : `${GRAPH_URL}/${pageId}/feed`;
  const body = new URLSearchParams({ access_token: accessToken });
  if (imageUrl) {
    body.set("url", imageUrl);
    body.set("caption", text);
  } else {
    body.set("message", text);
  }
  const res = await fetch(endpoint, { method: "POST", body });
  if (!res.ok) throw new Error(`Facebook Page post failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { id?: string; post_id?: string };
  const id = json.post_id ?? json.id ?? null;
  return { id, url: id ? `https://www.facebook.com/${id}` : null };
}
