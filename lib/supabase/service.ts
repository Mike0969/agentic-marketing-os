import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/config";

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS so that
 * trusted server operations — agent run logging, the team trigger called by
 * Hermes/n8n with AGENT_TRIGGER_TOKEN, and agent config reads/writes — work even
 * without an admin browser session.
 *
 * SECURITY: SUPABASE_SERVICE_ROLE_KEY must never be a NEXT_PUBLIC_* var and is
 * never sent to the browser. Returns null when unset, so callers fall back to
 * the cookie-based (RLS-enforced) client.
 */
export function isServiceConfigured() {
  return Boolean(getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceClient() {
  if (!isServiceConfigured()) return null;
  return createSupabaseClient(getSupabaseUrl()!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
