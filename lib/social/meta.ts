// Shared Meta Graph helpers for the Facebook and Instagram connectors.
// Login gives a SHORT-lived user token (~1-2 h). We swap it for a LONG-lived user token
// (fb_exchange_token, ~60 days); a Page token fetched with a long-lived user token does not
// expire by time. debug_token tells us the real expiry, which we store as expires_at.
export const GRAPH_VERSION = "v20.0";
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaApp = { clientId: string; clientSecret: string };
export type LongLivedToken = { access_token: string; expires_in?: number; token_type?: string };

export async function exchangeForLongLivedUserToken(shortLived: string, app: MetaApp): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    fb_exchange_token: shortLived
  });
  const res = await fetch(`${GRAPH_URL}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta long-lived token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as LongLivedToken;
  if (!json.access_token) throw new Error("Meta long-lived token exchange returned no access_token.");
  return json;
}

/**
 * Real expiry of a token via debug_token (app token = client_id|client_secret).
 * Returns an ISO timestamp, or null when Meta reports it never expires (expires_at = 0).
 * Throws when the token is reported invalid or the lookup fails.
 */
export async function tokenExpiry(token: string, app: MetaApp): Promise<string | null> {
  const params = new URLSearchParams({ input_token: token, access_token: `${app.clientId}|${app.clientSecret}` });
  const res = await fetch(`${GRAPH_URL}/debug_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta debug_token failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { is_valid?: boolean; expires_at?: number } };
  if (!json.data || json.data.is_valid === false) throw new Error("Meta reports the token as invalid.");
  const exp = Number(json.data.expires_at ?? 0);
  return exp > 0 ? new Date(exp * 1000).toISOString() : null;
}

export function isoIn(seconds: number | undefined, now = Date.now()): string | null {
  return seconds && seconds > 0 ? new Date(now + seconds * 1000).toISOString() : null;
}

/**
 * Expiry to store for a Page token derived from `user`. Prefer Meta's own answer; if the
 * lookup fails, fall back to the long-lived user token's expiry (never later than reality).
 */
export async function pageTokenExpiry(pageToken: string, user: LongLivedToken, app: MetaApp): Promise<string | null> {
  try {
    return await tokenExpiry(pageToken, app);
  } catch {
    return isoIn(user.expires_in) ?? isoIn(60 * 24 * 60 * 60);
  }
}
