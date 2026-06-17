import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env-loader.mjs";

const { url, publicKey } = getSupabaseEnv();

if (!url || !publicKey) {
  console.log("Supabase local env: missing NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, publicKey);
const tables = ["brands", "agents", "campaigns", "content_items", "approvals", "activity", "admin_users", "integration_configs", "agent_runs", "agent_settings", "agent_targets"];
const results = {};
let hasError = false;

const health = await supabase.rpc("schema_health");

if (!health.error && health.data) {
  Object.assign(results, health.data);
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
