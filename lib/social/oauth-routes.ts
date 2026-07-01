import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function startSocialOAuth(request: Request, options: StartOptions) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  if (!options.configured()) return NextResponse.json({ error: options.missingMessage }, { status: 503 });

  const brandId = new URL(request.url).searchParams.get("brand_id") ?? "";
  if (!UUID_RE.test(brandId)) return NextResponse.json({ error: "A valid brand_id is required." }, { status: 400 });

  const state = `${brandId}.${randomBytes(16).toString("hex")}`;
  const verifier = options.makeVerifier?.() ?? "";
  const res = NextResponse.redirect(options.getAuthorizeUrl(state, verifier));
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
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${options.platform}=${status}`, url.origin));
    res.cookies.set(stateCookie(options.platform), "", { maxAge: 0, path: "/" });
    res.cookies.set(verifierCookie(options.platform), "", { maxAge: 0, path: "/" });
    return res;
  };

  if (url.searchParams.get("error")) return back("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = readCookie(request, stateCookie(options.platform));
  const verifier = readCookie(request, verifierCookie(options.platform)) ?? "";
  if (!code || !state || !cookieState || decodeURIComponent(cookieState) !== state) return back("state_error");

  const brandId = state.split(".")[0];
  if (!UUID_RE.test(brandId)) return back("state_error");

  try {
    const token = await options.exchangeCode(code, verifier);
    const account = await options.resolveAccount(token.access_token);

    if (isSupabaseConfigured()) {
      const supabase = createServiceClient() ?? (await createClient());
      if (supabase) {
        const accountAccessToken = account.accessToken ?? token.access_token;
        const expiresAt = account.accessToken ? null : token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
        await supabase.from("social_connections").upsert(
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
      }
    }
    return back("connected");
  } catch {
    return back("error");
  }
}
