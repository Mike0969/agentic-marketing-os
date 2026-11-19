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

export async function refreshToken(refresh: string): Promise<TikTokToken> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_ID ?? "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refresh
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`TikTok token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as TikTokToken & { error?: string; error_description?: string };
  if (!json.access_token) throw new Error(`TikTok token refresh failed: ${json.error_description ?? json.error ?? "no access_token"}`);
  return json;
}

// ---- Content Posting API (Direct Post, video only) ----
// creator_info/query -> video/init (FILE_UPLOAD) -> PUT chunks to upload_url -> status/fetch poll.

const API = "https://open.tiktokapis.com/v2/post/publish";
const MB = 1024 * 1024;
const SINGLE_CHUNK_MAX = 64 * MB; // TikTok: <= 64 MB may go in one chunk
const CHUNK = 10 * MB; // TikTok: chunks 5-64 MB; the last chunk carries the remainder

type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

async function tiktokApi<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body)
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  const code = json.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    throw new Error(`TikTok ${path} failed (${res.status}${code ? ` ${code}` : ""}): ${(json.error?.message ?? "").slice(0, 300)}`);
  }
  return (json.data ?? {}) as T;
}

/** Chunk plan per TikTok's rules: one chunk up to 64 MB, otherwise 10 MB chunks with the remainder in the last. */
export function chunkPlan(size: number) {
  if (size <= 0) throw new Error("TikTok video is empty.");
  if (size <= SINGLE_CHUNK_MAX) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) };
}

/** Picks the privacy level: TIKTOK_PRIVACY_LEVEL when TikTok offers it, else SELF_ONLY, else the first option. */
export function choosePrivacy(options: string[], wanted = process.env.TIKTOK_PRIVACY_LEVEL) {
  if (wanted && options.includes(wanted)) return wanted;
  if (options.includes("SELF_ONLY")) return "SELF_ONLY";
  if (!options.length) throw new Error("TikTok returned no privacy options for this account.");
  return options[0];
}

export type TikTokPublishResult = { id: string | null; url: string | null; status: "published" | "processing"; publishId: string };

export async function publishVideo(
  accessToken: string,
  videoUrl: string,
  caption: string,
  opts: { pollAttempts?: number; pollIntervalMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<TikTokPublishResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const creator = await tiktokApi<{ privacy_level_options?: string[]; creator_username?: string }>(accessToken, "/creator_info/query/", {});
  const privacy = choosePrivacy(creator.privacy_level_options ?? []);

  const media = await fetch(videoUrl);
  if (!media.ok) throw new Error(`Could not download the video asset (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const plan = chunkPlan(bytes.length);

  const init = await tiktokApi<{ publish_id?: string; upload_url?: string }>(accessToken, "/video/init/", {
    post_info: { title: caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
    source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: plan.chunkSize, total_chunk_count: plan.count }
  });
  if (!init.publish_id || !init.upload_url) throw new Error("TikTok video/init returned no publish_id or upload_url.");

  const contentType = media.headers.get("content-type")?.startsWith("video/") ? media.headers.get("content-type")! : "video/mp4";
  for (let i = 0; i < plan.count; i++) {
    const start = i * plan.chunkSize;
    const end = i === plan.count - 1 ? bytes.length : start + plan.chunkSize; // exclusive
    const put = await fetch(init.upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType, "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}` },
      body: bytes.subarray(start, end)
    });
    if (!put.ok) throw new Error(`TikTok upload chunk ${i + 1}/${plan.count} failed (${put.status}).`);
  }

  const attempts = opts.pollAttempts ?? 5;
  for (let i = 0; i < attempts; i++) {
    const st = await tiktokApi<{ status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>(
      accessToken,
      "/status/fetch/",
      { publish_id: init.publish_id }
    );
    if (st.status === "FAILED") throw new Error(`TikTok publish failed: ${st.fail_reason ?? "unknown reason"}`);
    if (st.status === "PUBLISH_COMPLETE") {
      const postId = st.publicaly_available_post_id?.[0];
      const id = postId != null ? String(postId) : null;
      const url = id && creator.creator_username ? `https://www.tiktok.com/@${creator.creator_username}/video/${id}` : null;
      return { id, url, status: "published", publishId: init.publish_id };
    }
    if (i < attempts - 1) await sleep(opts.pollIntervalMs ?? 3000);
  }
  // Uploaded and accepted; TikTok is still processing. It finishes on TikTok's side.
  return { id: null, url: null, status: "processing", publishId: init.publish_id };
}
