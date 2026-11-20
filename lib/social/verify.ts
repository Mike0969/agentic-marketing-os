import { loadConnection } from "@/lib/social/connection-store";
import { GRAPH_URL } from "@/lib/social/meta";

/**
 * "Is this account really connected?" — a READ-ONLY check of each stored token against the
 * provider's identity endpoint (LinkedIn userinfo, X users/me, Graph page / IG account). Posts
 * nothing, never refreshes or rewrites a token. Results are cached in memory for 10 minutes so
 * the Settings page does not call the providers on every view.
 */

export type VerifyState = "valid" | "expired" | "revoked" | "error";
export type VerifyResult = { state: VerifyState; detail: string; checkedAt: string; account: string | null };

type Db = Parameters<typeof loadConnection>[0];
type FetchFn = typeof fetch;

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; result: VerifyResult }>();

const result = (state: VerifyState, detail: string, account: string | null = null): VerifyResult => ({ state, detail, account, checkedAt: new Date().toISOString() });

async function getJson(fetchImpl: FetchFn, url: string, token: string) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

/** Map one provider answer to valid / expired / revoked / error. Pure, so it is unit-tested. */
export function classify(platform: string, status: number, body: Record<string, unknown>, hasRefresh: boolean): VerifyResult {
  if (status >= 200 && status < 300) {
    const account =
      (body.name as string) ??
      (body.username as string) ??
      ((body.data as Record<string, unknown> | undefined)?.username as string) ??
      null;
    return result("valid", "Token accepted by the provider.", account ?? null);
  }
  if (platform === "facebook" || platform === "instagram") {
    const err = (body.error ?? {}) as { code?: number; error_subcode?: number; message?: string };
    if (err.code === 190) {
      // 463 = expired; 460 password changed; 458 app removed; 467 logged out/invalid.
      if (err.error_subcode === 463) return result("expired", "Meta says the token has expired.");
      return result("revoked", `Meta rejected the token${err.error_subcode ? ` (subcode ${err.error_subcode})` : ""}: reconnect.`);
    }
    return result("error", `Meta answered HTTP ${status}${err.message ? `: ${String(err.message).slice(0, 120)}` : ""}.`);
  }
  if (status === 401) {
    // A refresh token is stored, but testing it would rotate the tokens (a write), so it stays unverified.
    if (hasRefresh) return result("expired", "Access token expired; a refresh token is stored but is not tested by this read-only check. Reconnect to be sure.");
    return result("expired", "The provider rejected the token (expired or revoked): reconnect.");
  }
  if (status === 403) return result("error", "Token accepted but missing the profile permission for this check.");
  return result("error", `Provider answered HTTP ${status}.`);
}

export async function verifyConnection(db: Db, brandId: string, platform: string, authorUrn: string | null, fetchImpl: FetchFn = fetch): Promise<VerifyResult> {
  const key = `${brandId}:${platform}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;
  let out: VerifyResult;
  try {
    const loaded = await loadConnection(db, brandId, platform);
    if (!loaded.ok) out = result("error", loaded.error);
    else if (!loaded.conn?.access_token) out = result("error", "No stored access token.");
    else {
      const token = loaded.conn.access_token;
      const hasRefresh = Boolean(loaded.conn.refresh_token);
      let url: string | null = null;
      if (platform === "linkedin") url = "https://api.linkedin.com/v2/userinfo";
      else if (platform === "x") url = "https://api.x.com/2/users/me";
      else if (platform === "facebook") url = `${GRAPH_URL}/${authorUrn || "me"}?fields=id,name`;
      else if (platform === "instagram") url = authorUrn ? `${GRAPH_URL}/${authorUrn}?fields=id,username` : null;
      if (!url) out = result("error", `No identity check for ${platform}.`);
      else {
        const { status, body } = await getJson(fetchImpl, url, token);
        out = classify(platform, status, body, hasRefresh);
      }
    }
  } catch (error) {
    out = result("error", error instanceof Error ? error.message.slice(0, 160) : "Check failed.");
  }
  cache.set(key, { at: Date.now(), result: out });
  return out;
}

const inflight = new Map<string, Promise<VerifyResult>>();

/**
 * Non-blocking read for page renders: returns the last result (even if older than 10 min) or null,
 * and refreshes stale/missing entries in the background. The page never waits on a provider.
 */
export function peekVerification(db: Db, brandId: string, platform: string, authorUrn: string | null): VerifyResult | null {
  const key = `${brandId}:${platform}`;
  const hit = cache.get(key);
  const stale = !hit || Date.now() - hit.at >= TTL_MS;
  if (stale && !inflight.has(key)) {
    const p = verifyConnection(db, brandId, platform, authorUrn).finally(() => inflight.delete(key));
    inflight.set(key, p);
    p.catch(() => {});
  }
  return hit?.result ?? null;
}

export function verifyLabel(v: VerifyResult | null | undefined): { text: string; tone: "ok" | "warn" | "danger" } | null {
  if (!v) return null;
  const at = new Date(v.checkedAt).toISOString().slice(11, 16);
  // One short line; the details are in the tooltip, the Reconnect button sits next to it.
  if (v.state === "valid") return { text: `Connected · checked ${at}`, tone: "ok" };
  if (v.state === "expired") return { text: `Expired · checked ${at}`, tone: "warn" };
  if (v.state === "revoked") return { text: `Revoked · checked ${at}`, tone: "danger" };
  return { text: `Check failed · ${at}`, tone: "warn" };
}
