import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { getSupabasePublicKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config";

const publicPaths = ["/login", "/forgot-password", "/reset-password", "/auth/callback"];

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured() || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
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
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const configuredAdmin = process.env.ADMIN_EMAIL;
  const isEnvAdmin = configuredAdmin && user.email && configuredAdmin.toLowerCase() === user.email.toLowerCase();
  const { data: adminRecord } = isEnvAdmin
    ? { data: { email: user.email } }
    : await supabase.from("admin_users").select("email").ilike("email", user.email ?? "").maybeSingle();

  if (!adminRecord) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
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
    "/((?!_next/static|_next/image|favicon.ico|api/auth/logout|api/health|api/agents/team|api/marketing/seo-loop|api/marketing/automation/cron|api/marketing/campaigns/.*/orchestrate|api/marketing/campaigns/.*/automation/tick|api/marketing/campaigns/propose-ideas|api/marketing/campaigns/.*/run|api/marketing/content-items/.*/rework|api/sales/analyze|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
