export function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

/**
 * Running without Supabase (local JSON store, no login) must be asked for explicitly with
 * LOCAL_MODE=true, and is never allowed in production. Missing Supabase config otherwise
 * fails closed instead of granting admin access.
 */
export function isLocalModeAllowed(env: Record<string, string | undefined> = process.env) {
  return env.LOCAL_MODE === "true" && env.NODE_ENV !== "production";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabasePublicKey());
}
