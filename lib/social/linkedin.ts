// LinkedIn OAuth (3-legged) + post publishing as the member or as an organization (Company Page).
// Server-only; tokens never reach the browser. Member posts need `w_member_social` ("Share on
// LinkedIn"); organization posts need `w_organization_social` (Community Management API) and the
// connected member must be an admin of the page.

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const LINKEDIN_VERSION = "202506"; // monthly version header required by /rest/posts
export const LINKEDIN_SCOPES = "openid profile w_member_social";
export const LINKEDIN_ORG_SCOPE = "w_organization_social";
const ORG_URN_RE = /^urn:li:organization:[0-9]+$/;

export function isOrganizationUrn(value: unknown): value is string {
  return typeof value === "string" && ORG_URN_RE.test(value);
}

export function linkedinConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/api/auth/linkedin/callback";
}

/** `organization: true` also asks for w_organization_social (only for brands that post as a page). */
export function getAuthorizeUrl(state: string, opts: { organization?: boolean } = {}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: linkedinRedirectUri(),
    state,
    scope: opts.organization ? `${LINKEDIN_SCOPES} ${LINKEDIN_ORG_SCOPE}` : LINKEDIN_SCOPES
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

export async function refreshToken(refreshToken: string): Promise<LinkedInToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? ""
  });
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`LinkedIn token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
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

/**
 * Who authors the post: the brand's organization when configured, else the connected member.
 * Fails clearly when an organization is configured but the stored grant lacks w_organization_social.
 */
export function linkedinAuthor(args: { memberUrn: string; organizationUrn: string | null | undefined; scopes: string | null | undefined }):
  | { ok: true; author: string; asOrganization: boolean }
  | { ok: false; error: string } {
  const org = args.organizationUrn?.trim();
  if (!org) return { ok: true, author: args.memberUrn, asOrganization: false };
  if (!isOrganizationUrn(org)) return { ok: false, error: `LinkedIn organization "${org}" is not a valid urn:li:organization:<id>.` };
  const granted = (args.scopes ?? "").split(/[\s,]+/).filter(Boolean);
  if (args.scopes != null && !granted.includes(LINKEDIN_ORG_SCOPE)) {
    return { ok: false, error: `This brand posts as a LinkedIn page, but the connection lacks ${LINKEDIN_ORG_SCOPE}; reconnect LinkedIn in Settings.` };
  }
  return { ok: true, author: org, asOrganization: true };
}

/** Publish a post as `authorUrn` (member or organization), with an optional image. Returns the post id + URL. */
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
