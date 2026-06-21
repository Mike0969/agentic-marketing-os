import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, loadLocalEnv } from "./env-loader.mjs";

loadLocalEnv();
const { url, publicKey } = getSupabaseEnv();

if (!url || !publicKey) {
  console.log("Supabase local env: missing NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, publicKey);
const serviceSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : supabase;
const tables = [
  "brands",
  "agents",
  "campaigns",
  "content_items",
  "approvals",
  "activity",
  "admin_users",
  "integration_configs",
  "agent_runs",
  "agent_settings",
  "agent_targets",
  "agent_config"
];
const results = {};
let hasError = false;

const health = await supabase.rpc("schema_health");

if (!health.error && health.data) {
  Object.assign(results, health.data);
  if (!Object.hasOwn(results, "agent_config")) {
    const { count, error } = await serviceSupabase.from("agent_config").select("id", { count: "exact" }).limit(1);
    if (error) {
      hasError = true;
      results.agent_config = `error: ${error.message}`;
    } else {
      results.agent_config = count ?? 0;
    }
  }
} else {
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact" }).limit(1);

    if (error) {
      hasError = true;
      results[table] = `error: ${error.message}`;
    } else {
      results[table] = count ?? 0;
    }
  }
}

console.log("Supabase connection: OK");
console.log(JSON.stringify(results, null, 2));

if (hasError) {
  console.log("Supabase schema: missing or not exposed. Run supabase/setup.sql in the Supabase SQL editor.");
  process.exit(1);
}
