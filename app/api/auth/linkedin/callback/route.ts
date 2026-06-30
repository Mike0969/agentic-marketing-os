import { NextResponse } from "next/server";
import { exchangeCode, getMemberUrn } from "@/lib/social/linkedin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// LinkedIn redirects the operator's browser here after consent. Verify state (cookie), exchange the
// code for a token, resolve the member URN, and store the connection per brand.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin));
    res.cookies.set("li_oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  };

  if (url.searchParams.get("error")) return back("/settings?linkedin=denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers.get("cookie")?.match(/li_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !cookieState || decodeURIComponent(cookieState) !== state) {
    return back("/settings?linkedin=state_error");
  }

  const brandId = state.split(".")[0];
  try {
    const token = await exchangeCode(code);
    const { urn } = await getMemberUrn(token.access_token);

    if (isSupabaseConfigured()) {
      const supabase = createServiceClient() ?? (await createClient());
      if (supabase) {
        const expiresAt = new Date(Date.now() + (token.expires_in ?? 0) * 1000).toISOString();
        await supabase.from("social_connections").upsert(
          {
            brand_id: brandId,
            platform: "linkedin",
            access_token: token.access_token,
            refresh_token: token.refresh_token ?? null,
            expires_at: expiresAt,
            author_urn: urn,
            scopes: token.scope ?? null,
            status: "connected",
            connected_by: "admin",
            updated_at: new Date().toISOString()
          },
          { onConflict: "brand_id,platform" }
        );
      }
    }
    return back("/settings?linkedin=connected");
  } catch {
    return back("/settings?linkedin=error");
  }
}
