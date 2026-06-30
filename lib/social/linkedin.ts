// LinkedIn OAuth (3-legged) + member-post publishing. Server-only; tokens never reach the browser.
// Posting requires the `w_member_social` scope on your LinkedIn app ("Share on LinkedIn" product).

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const LINKEDIN_VERSION = "202506"; // monthly version header required by /rest/posts
export const LINKEDIN_SCOPES = "openid profile w_member_social";

export function linkedinConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/api/auth/linkedin/callback";
}

export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: linkedinRedirectUri(),
    state,
    scope: LINKEDIN_SCOPES
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type LinkedInToken = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

export async function exchangeCode(code: string): Promise<LinkedInToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: linkedinRedirectUri(),
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? ""
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`LinkedIn token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as LinkedInToken;
}

export async function getMemberUrn(accessToken: string): Promise<{ urn: string; name: string | null }> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`LinkedIn userinfo failed (${res.status}).`);
  const j = (await res.json()) as { sub: string; name?: string };
  return { urn: `urn:li:person:${j.sub}`, name: j.name ?? null };
}

// Upload an image to LinkedIn (3-step: initialize → PUT bytes → return image URN).
async function uploadImage(accessToken: string, ownerUrn: string, imageUrl: string): Promise<string> {
  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } })
  });
  if (!init.ok) throw new Error(`LinkedIn image init failed (${init.status}): ${(await init.text()).slice(0, 200)}`);
  const value = ((await init.json()) as { value?: { uploadUrl?: string; image?: string } }).value ?? {};
  if (!value.uploadUrl || !value.image) throw new Error("LinkedIn image init returned no upload URL.");

  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`Could not fetch image to upload (${img.status}).`);
  const bytes = Buffer.from(await img.arrayBuffer());

  const up = await fetch(value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, body: bytes });
  if (!up.ok) throw new Error(`LinkedIn image upload failed (${up.status}).`);
  return value.image;
}

/** Publish a post as the authenticated member, with an optional image. Returns the post id + URL. */
export async function publishMemberPost(accessToken: string, authorUrn: string, text: string, imageUrl?: string | null): Promise<{ id: string | null; url: string | null }> {
  const body: Record<string, unknown> = {
    author: authorUrn,
    commentary: text,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };
  if (imageUrl) {
    const imageUrn = await uploadImage(accessToken, authorUrn, imageUrl);
    body.content = { media: { id: imageUrn } };
  }

  const res = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`LinkedIn post failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const id = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : null };
}
