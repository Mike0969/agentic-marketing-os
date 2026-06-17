import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type AdminCheck =
  | { ok: true; mode: "local" | "supabase"; email: string | null }
  | { ok: false; response: NextResponse; status: 401 | 403 };

export async function requireAdmin(): Promise<AdminCheck> {
  if (!isSupabaseConfigured()) {
    return { ok: true, mode: "local", email: null };
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

export async function getShellAuthStatus() {
  if (!isSupabaseConfigured()) {
    return { supabaseConfigured: false, isAuthenticated: true, isAdmin: true, email: null };
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
