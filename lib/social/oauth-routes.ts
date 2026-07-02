import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATE_TTL_MS = 10 * 60 * 1000;

export type SocialPlatform = "x" | "facebook" | "instagram" | "tiktok";

type StartOptions = {
  platform: SocialPlatform;
  configured: () => boolean;
  getAuthorizeUrl: (state: string, verifier: string) => string;
  makeVerifier?: () => string;
  missingMessage: string;
};

type CallbackOptions<Token extends { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> = {
  platform: SocialPlatform;
  exchangeCode: (code: string, verifier: string) => Promise<Token>;
  resolveAccount: (accessToken: string) => Promise<{ accountId: string; handle: string | null; accessToken?: string }>;
};

function stateCookie(platform: SocialPlatform) {
  return `${platform}_oauth_state`;
}

function verifierCookie(platform: SocialPlatform) {
  return `${platform}_oauth_verifier`;
}

function stateSecret() {
  return (
    process.env.SOCIAL_OAUTH_STATE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.X_CLIENT_SECRET ||
    "local-dev-social-oauth-state"
  );
}

function signStatePayload(payload: string) {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

function createState(brandId: string) {
  const payload = `${brandId}.${Date.now()}.${randomBytes(16).toString("hex")}`;
  return `v1.${payload}.${signStatePayload(payload)}`;
}

function verifySignedState(state: string) {
  const parts = state.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, brandId, issuedAtRaw, nonce, sig] = parts;
  if (!UUID_RE.test(brandId) || !/^\d+$/.test(issuedAtRaw) || !nonce) return null;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS) return null;
  const payload = `${brandId}.${issuedAtRaw}.${nonce}`;
  const expected = signStatePayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(sig);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;
  return brandId;
}

function brandIdFromState(state: string, cookieState?: string | null) {
  if (cookieState && decodeURIComponent(cookieState) === state) {
    const parts = state.split(".");
    const brandId = parts[0] === "v1" ? parts[1] : parts[0];
    return UUID_RE.test(brandId) ? brandId : null;
  }
  return verifySignedState(state);
}

function oauthErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("attached to a project")) return "x_project";
  if (lower.includes("invalid_client")) return "invalid_client";
  if (lower.includes("invalid_grant")) return "invalid_grant";
  if (lower.includes("unauthorized_client")) return "unauthorized_client";
  if (lower.includes("redirect")) return "redirect_uri";
  if (lower.includes("lookup") || lower.includes("users/me")) return "account_lookup";
  if (lower.includes("duplicate key") || lower.includes("violates") || lower.includes("supabase")) return "db_write";
  if (lower.includes("token exchange")) return "token_exchange";
  return "callback_error";
}

export async function startSocialOAuth(request: Request, options: StartOptions) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  if (!options.configured()) return NextResponse.json({ error: options.missingMessage }, { status: 503 });

  const brandId = new URL(request.url).searchParams.get("brand_id") ?? "";
  if (!UUID_RE.test(brandId)) return NextResponse.json({ error: "A valid brand_id is required." }, { status: 400 });

  const state = createState(brandId);
  const verifier = options.makeVerifier?.() ?? "";
  const authorizeUrl = options.getAuthorizeUrl(state, verifier);
  const requestOrigin = new URL(request.url).origin;
  const redirectUri = new URL(authorizeUrl).searchParams.get("redirect_uri");
  if (redirectUri) {
    const redirectOrigin = new URL(redirectUri).origin;
    const localRedirect = redirectOrigin.includes("localhost") || redirectOrigin.includes("127.0.0.1");
    if (localRedirect && redirectOrigin !== requestOrigin) {
      return NextResponse.json(
        {
          error: `OAuth redirect is configured for ${redirectOrigin}, but this dev server is running at ${requestOrigin}. Stop the other dev server and restart on the configured port, or update the provider callback URL and env together.`
        },
        { status: 409 }
      );
    }
  }

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(stateCookie(options.platform), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  if (verifier) {
    res.cookies.set(verifierCookie(options.platform), verifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/"
    });
  }
  return res;
}

function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function handleSocialOAuthCallback<Token extends { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(
  request: Request,
  options: CallbackOptions<Token>
) {
  const url = new URL(request.url);
  const back = (status: string, detail?: string) => {
    const target = new URL("/settings", url.origin);
    target.searchParams.set(options.platform, status);
    if (detail) target.searchParams.set(`${options.platform}_detail`, detail);
    const res = NextResponse.redirect(target);
    res.cookies.set(stateCookie(options.platform), "", { maxAge: 0, path: "/" });
    res.cookies.set(verifierCookie(options.platform), "", { maxAge: 0, path: "/" });
    return res;
  };

  if (url.searchParams.get("error")) return back("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readCookie(request, stateCookie(options.platform));
  const verifier = readCookie(request, verifierCookie(options.platform)) ?? "";
  if (!code || !state) return back("state_error", "missing_code_or_state");

  const brandId = brandIdFromState(state, cookieState);
  if (!brandId) return back("state_error", "state_mismatch");

  try {
    const token = await options.exchangeCode(code, verifier);
    const account = await options.resolveAccount(token.access_token);

    if (isSupabaseConfigured()) {
      const supabase = createServiceClient() ?? (await createClient());
      if (supabase) {
        const accountAccessToken = account.accessToken ?? token.access_token;
        const expiresAt = account.accessToken ? null : token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
        const { error } = await supabase.from("social_connections").upsert(
          {
            brand_id: brandId,
            platform: options.platform,
            access_token: accountAccessToken,
            refresh_token: token.refresh_token ?? null,
            expires_at: expiresAt,
            author_urn: account.accountId,
            scopes: token.scope ?? null,
            status: "connected",
            connected_by: account.handle ?? "admin",
            updated_at: new Date().toISOString()
          },
          { onConflict: "brand_id,platform" }
        );
        if (error) throw new Error(`Supabase social connection upsert failed: ${error.message}`);
      }
    }
    return back("connected");
  } catch (error) {
    const detail = oauthErrorCode(error);
    console.error(`[social-oauth:${options.platform}] callback failed`, {
      detail,
      error: error instanceof Error ? error.message : String(error)
    });
    return back("error", detail);
  }
}
