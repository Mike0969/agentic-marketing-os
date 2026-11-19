import { NextResponse } from "next/server";
import { hasValidBearer } from "@/lib/auth-token";
import { isLocalModeAllowed } from "@/lib/supabase/config";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type AdminCheck =
  | { ok: true; mode: "local" | "supabase"; email: string | null }
  | { ok: false; response: NextResponse; status: 401 | 403 | 503 };

export async function requireAdmin(): Promise<AdminCheck> {
  if (!isSupabaseConfigured()) {
    if (isLocalModeAllowed()) return { ok: true, mode: "local", email: null };
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication is not configured (Supabase env missing)." }, { status: 503 }),
      status: 503
    };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: "Supabase is not available." }, { status: 503 }), status: 401 };
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { ok: false, response: NextResponse.json({ error: "Authentication required." }, { status: 401 }), status: 401 };
  }

  if (await isAdminEmail(user.email)) {
    return { ok: true, mode: "supabase", email: user.email };
  }

  return { ok: false, response: NextResponse.json({ error: "Admin access required." }, { status: 403 }), status: 403 };
}

/**
 * Access check for machine-to-machine triggers (Hermes / n8n / Telegram / Vercel cron).
 * Accepts a bearer token matching AGENT_TRIGGER_TOKEN or CRON_SECRET (constant-time
 * compare), otherwise falls back to the normal admin session check. Unset tokens
 * never match, so with neither set only an admin session is accepted (secure default).
 */
export async function requireAgentAccess(request: Request): Promise<AdminCheck> {
  if (hasValidBearer(request, ["AGENT_TRIGGER_TOKEN", "CRON_SECRET"])) {
    return { ok: true, mode: "local", email: null };
  }
  return requireAdmin();
}

/**
 * Local developer smoke tests run through curl without browser cookies. Allow
 * loopback-only access outside production, otherwise use the normal machine
 * token/admin path.
 */
export async function requireAgentAccessOrLocalhost(request: Request): Promise<AdminCheck> {
  if (process.env.NODE_ENV !== "production") {
    const hostname = new URL(request.url).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return { ok: true, mode: "local", email: null };
    }
  }

  return requireAgentAccess(request);
}

export async function getShellAuthStatus() {
  if (!isSupabaseConfigured()) {
    const local = isLocalModeAllowed();
    return { supabaseConfigured: false, isAuthenticated: local, isAdmin: local, email: null };
  }

  const supabase = await createClient();

  if (!supabase) {
    return { supabaseConfigured: true, isAuthenticated: false, isAdmin: false, email: null };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const email = user?.email ?? null;
  const isAdmin = email ? await isAdminEmail(email) : false;

  return { supabaseConfigured: true, isAuthenticated: Boolean(user), isAdmin, email };
}

export async function isAdminEmail(email: string) {
  const configuredAdmin = process.env.ADMIN_EMAIL;

  if (configuredAdmin && configuredAdmin.toLowerCase() === email.toLowerCase()) {
    return true;
  }

  const supabase = await createClient();

  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase.from("admin_users").select("email").ilike("email", email).maybeSingle();
  return !error && Boolean(data);
}
