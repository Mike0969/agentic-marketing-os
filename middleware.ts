import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { getSupabasePublicKey, getSupabaseUrl, isLocalModeAllowed, isSupabaseConfigured } from "@/lib/supabase/config";
import { publicUrl } from "@/lib/site-url";

const publicPaths = ["/login", "/forgot-password", "/reset-password", "/auth/callback"];

export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (!isSupabaseConfigured()) {
    // Fail closed: no Supabase means no login, so only an explicit local (non-production) run is open.
    if (isLocalModeAllowed()) return NextResponse.next();
    return new NextResponse("Authentication is not configured.", { status: 503 });
  }

  let response = NextResponse.next({ request });
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublicKey();

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // Public origin, not request.url (behind the Funnel that is 127.0.0.1:3470).
    const loginUrl = publicUrl("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const configuredAdmin = process.env.ADMIN_EMAIL;
  const isEnvAdmin = configuredAdmin && user.email && configuredAdmin.toLowerCase() === user.email.toLowerCase();
  const { data: adminRecord } = isEnvAdmin
    ? { data: { email: user.email } }
    : await supabase.from("admin_users").select("email").ilike("email", user.email ?? "").maybeSingle();

  if (!adminRecord) {
    const loginUrl = publicUrl("/login", request.url);
    loginUrl.searchParams.set("admin", "required");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brain/vendor/.*|lead(?:/.*)?|api/auth/logout|api/email/unsubscribe|api/auth/linkedin/start|api/auth/linkedin/callback|api/auth/x/start|api/auth/x/callback|api/auth/facebook/start|api/auth/facebook/callback|api/auth/instagram/start|api/auth/instagram/callback|api/auth/tiktok/start|api/auth/tiktok/callback|api/health|api/brain/graph|api/agents/team|api/leads/capture|api/marketing/seo-loop|api/marketing/automation/cron|api/marketing/campaigns/.*/orchestrate|api/marketing/campaigns/.*/automation/tick|api/marketing/campaigns/propose-ideas|api/marketing/campaigns/.*/run|api/marketing/content-items/.*/rework|api/sales/analyze|api/sales/consolidate|api/analytics/search-console/ingest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
