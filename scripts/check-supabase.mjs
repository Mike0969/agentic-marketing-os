import { existsSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const envPath = ".env.local";

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").replace(/^["']|["']$/g, "");
    process.env[key] = value;
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.log("Supabase local env: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, anonKey);
const tables = ["brands", "agents", "campaigns", "content_items", "approvals"];
const results = {};

for (const table of tables) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

  if (error) {
    results[table] = `error: ${error.message}`;
  } else {
    results[table] = count ?? 0;
  }
}

console.log("Supabase connection: OK");
console.log(JSON.stringify(results, null, 2));
