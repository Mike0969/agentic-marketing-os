// Populate real brand context for GridFactory.io and Gulf-EL.com / NexRide.
// Run: node scripts/seed-brands.mjs
//
// Writing to `brands` is RLS-protected (admin only), so this needs the
// SERVICE ROLE key. Set SUPABASE_SERVICE_ROLE_KEY in .env.local first, e.g.:
//   SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Settings → API>
// If you'd rather not, just run supabase/seed-brands.sql in the SQL Editor instead.
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./env-loader.mjs";

loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local, or run supabase/seed-brands.sql in the SQL Editor.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const updates = [
  {
    label: "GridFactory.io",
    match: (q) => q.or("name.ilike.%gridfactory%,website.ilike.%gridfactory%"),
    values: {
      pillars: "GPU infrastructure, green energy data centers, modular design, European expansion",
      seo_targets: "GPU cloud provider, green data center Europe, modular data center, H100 H200 colocation",
      ctas: "Request capacity, Download investor deck, Book a site visit",
      approval_rules: "No financial claims without legal review. No unverified capacity numbers."
    }
  },
  {
    label: "Gulf-EL.com / NexRide",
    match: (q) => q.or("name.ilike.%gulf-el%,name.ilike.%gulf el%,name.ilike.%nexride%,website.ilike.%gulf-el%"),
    values: {
      pillars: "zero-commission ride-hailing, EV fleet, AI dispatch, GCC mobility",
      seo_targets: "ride-hailing GCC, EV taxi Dubai, zero commission driver app, tokenized loyalty transport",
      ctas: "Join as driver, Book a ride, Partner with us",
      approval_rules: "No pricing claims without ops confirmation. No market share claims."
    }
  }
];

let failed = false;
for (const u of updates) {
  const { data, error } = await u.match(supabase.from("brands").update(u.values)).select("name");
  if (error) {
    failed = true;
    console.error(`✗ ${u.label}: ${error.message}`);
  } else {
    console.log(`✓ ${u.label}: updated ${data?.length ?? 0} row(s)${data?.length ? ` (${data.map((r) => r.name).join(", ")})` : ""}`);
  }
}

process.exit(failed ? 1 : 0);
