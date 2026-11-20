import { appKey } from "@/lib/social/app-keys";
import { GRAPH_URL, exchangeForLongLivedUserToken, pageTokenExpiry, type MetaApp } from "@/lib/social/meta";

const AUTH_URL = "https://www.facebook.com/v20.0/dialog/oauth";
const TOKEN_URL = `${GRAPH_URL}/oauth/access_token`;
export const INSTAGRAM_SCOPES = "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish";

export function instagramConfigured() {
  return Boolean(appKey("INSTAGRAM_CLIENT_ID") && appKey("INSTAGRAM_CLIENT_SECRET"));
}

export function instagramRedirectUri() {
  return process.env.INSTAGRAM_REDIRECT_URI || "http://localhost:3000/api/auth/instagram/callback";
}

export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: appKey("INSTAGRAM_CLIENT_ID") ?? "",
    redirect_uri: instagramRedirectUri(),
    state,
    scope: INSTAGRAM_SCOPES,
    response_type: "code"
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type InstagramToken = { access_token: string; expires_in?: number; scope?: string };

function app(): MetaApp {
  return { clientId: appKey("INSTAGRAM_CLIENT_ID") ?? "", clientSecret: appKey("INSTAGRAM_CLIENT_SECRET") ?? "" };
}

/** Code -> short-lived user token -> LONG-lived user token (fb_exchange_token). */
export async function exchangeCode(code: string): Promise<InstagramToken> {
  const params = new URLSearchParams({
    client_id: app().clientId,
    client_secret: app().clientSecret,
    redirect_uri: instagramRedirectUri(),
    code
  });
  const res = await fetch(`${TOKEN_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Instagram token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const short = (await res.json()) as InstagramToken;
  const long = await exchangeForLongLivedUserToken(short.access_token, app());
  return { access_token: long.access_token, expires_in: long.expires_in, scope: short.scope };
}

/** Resolves the Page (and IG account) with the LONG-lived user token; the Page token's real expiry is looked up. */
export async function resolveAccount(accessToken: string, userToken?: { expires_in?: number }): Promise<{ accountId: string; handle: string | null; accessToken: string; expiresAt: string | null }> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,access_token,instagram_business_account{id,username}"
  });
  const res = await fetch(`${GRAPH_URL}/me/accounts?${params.toString()}`);
  if (!res.ok) throw new Error(`Instagram account lookup failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Array<{ access_token?: string; instagram_business_account?: { id?: string; username?: string } }> };
  const page = json.data?.find((p) => p.access_token && p.instagram_business_account?.id);
  const ig = page?.instagram_business_account;
  if (!page?.access_token || !ig?.id) throw new Error("No Instagram Business/Creator account connected to a manageable Facebook Page.");
  const expiresAt = await pageTokenExpiry(page.access_token, { expires_in: userToken?.expires_in }, app());
  return { accountId: ig.id, handle: ig.username ?? null, accessToken: page.access_token, expiresAt };
}

export async function publishPost(accessToken: string, igUserId: string, text: string, imageUrl?: string | null): Promise<{ id: string | null; url: string | null }> {
  if (!imageUrl) throw new Error("Instagram Graph publishing requires a public image URL for image posts.");
  const createBody = new URLSearchParams({ access_token: accessToken, image_url: imageUrl, caption: text });
  const create = await fetch(`${GRAPH_URL}/${igUserId}/media`, { method: "POST", body: createBody });
  if (!create.ok) throw new Error(`Instagram media create failed (${create.status}): ${(await create.text()).slice(0, 300)}`);
  const created = (await create.json()) as { id?: string };
  if (!created.id) throw new Error("Instagram media create returned no container id.");

  const publishBody = new URLSearchParams({ access_token: accessToken, creation_id: created.id });
  const publish = await fetch(`${GRAPH_URL}/${igUserId}/media_publish`, { method: "POST", body: publishBody });
  if (!publish.ok) throw new Error(`Instagram publish failed (${publish.status}): ${(await publish.text()).slice(0, 300)}`);
  const json = (await publish.json()) as { id?: string };
  return { id: json.id ?? null, url: json.id ? `https://www.instagram.com/p/${json.id}/` : null };
}
