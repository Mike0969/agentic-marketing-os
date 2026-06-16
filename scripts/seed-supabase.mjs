import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env-loader.mjs";

const { url, publicKey } = getSupabaseEnv();

if (!url || !publicKey) {
  console.log("Supabase local env: missing NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, publicKey);

const brands = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "GridFactory.io",
    website: "https://gridfactory.io",
    positioning: "AI, grid, and data-center power infrastructure for investor-grade energy projects.",
    target_audience: "Data-center operators, infrastructure funds, utilities, energy developers, and strategic investors.",
    tone_of_voice: "Technical, sober, boardroom-ready, and commercially precise.",
    active: true
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Gulf-EL.com / NexRide",
    website: "https://gulf-el.com",
    positioning: "Electric mobility, zero-commission ride-hailing, AI dispatch, and tokenized loyalty for GCC transport.",
    target_audience: "GCC riders, EV drivers, fleet partners, regulators, loyalty partners, and mobility investors.",
    tone_of_voice: "Ambitious, clear, regionally fluent, tech-forward, and trust-building.",
    active: true
  }
];

const agents = [
  ["aaaaaaaa-0001-4000-8000-000000000001", "Crina", "Marketing CEO Agent", "Owns strategy, channel orchestration, approval routing, and weekly executive reporting.", "GPT-5 / Claude Opus / Hermes", "active"],
  ["aaaaaaaa-0002-4000-8000-000000000002", "SEO Agent", "Search Strategy", "Builds keyword clusters, technical SEO tasks, and search-intent briefs.", "GPT-5", "active"],
  ["aaaaaaaa-0003-4000-8000-000000000003", "Content Creator Agent", "Copy and Editorial", "Turns campaign briefs into posts, articles, email copy, hooks, and CTAs.", "Claude Sonnet", "active"],
  ["aaaaaaaa-0004-4000-8000-000000000004", "Visual & Video Agent", "Creative Production", "Creates visual briefs, AI image/video prompts, storyboards, and asset specs.", "GPT-5 + Sora", "standby"],
  ["aaaaaaaa-0005-4000-8000-000000000005", "Competitor Intelligence Agent", "Market Monitoring", "Tracks competitor positioning, campaign signals, SERP movement, and industry narratives.", "DeepSeek / GPT-5", "active"],
  ["aaaaaaaa-0006-4000-8000-000000000006", "Publishing Agent", "Scheduling and Distribution", "Prepares channel-specific publishing packages and future social/API handoffs.", "GPT-5 mini", "standby"],
  ["aaaaaaaa-0007-4000-8000-000000000007", "Analytics Agent", "Performance Analysis", "Summarizes content performance, campaign ROI, and next-best actions.", "GPT-5", "active"]
].map(([id, name, role, description, model_preference, status]) => ({
  id,
  name,
  role,
  description,
  model_preference,
  status,
  brand_scope: "All brands"
}));

const campaigns = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    brand_id: brands[0].id,
    title: "AI Grid Infrastructure Investor Narrative",
    objective: "Establish GridFactory as a credible platform for data-center power infrastructure investment.",
    target_audience: "Infrastructure funds, energy investors, hyperscale data-center partners.",
    status: "active",
    start_date: "2026-06-01",
    end_date: "2026-08-30"
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    brand_id: brands[1].id,
    title: "NexRide GCC Mobility Launch",
    objective: "Build market confidence for zero-commission EV ride-hailing and loyalty infrastructure.",
    target_audience: "Riders, EV drivers, fleet owners, local partners, and mobility investors.",
    status: "planning",
    start_date: "2026-06-10",
    end_date: "2026-09-15"
  }
];

const contentItems = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    brand_id: brands[0].id,
    campaign_id: campaigns[0].id,
    platform: "LinkedIn",
    content_type: "Founder post",
    title: "Why AI Growth Is Becoming a Grid Infrastructure Problem",
    body: "AI demand is rewriting energy planning. GridFactory focuses on the power layer behind durable data-center growth.",
    hook: "The AI infrastructure bottleneck is no longer only chips.",
    CTA: "Book an investor briefing",
    status: "approval",
    assigned_agent: "Crina",
    approval_status: "pending",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    brand_id: brands[1].id,
    campaign_id: campaigns[1].id,
    platform: "LinkedIn",
    content_type: "Market note",
    title: "Why GCC Mobility Needs Better Driver Economics",
    body: "Market note on EV adoption, commission structures, and trust.",
    hook: "The next mobility platform wins by aligning incentives.",
    CTA: "Talk to the NexRide team",
    status: "analyzed",
    assigned_agent: "Analytics Agent",
    approval_status: "approved",
    scheduled_at: "2026-06-12T08:30:00.000Z",
    published_at: "2026-06-12T08:30:00.000Z",
    performance_summary: "Mock: 11.2k impressions, 312 clicks, strong fleet-partner saves."
  }
];

const approvals = [
  {
    id: "77777777-7777-4777-8777-777777777777",
    content_item_id: contentItems[0].id,
    requested_by_agent: "Crina",
    decision: "pending",
    feedback: "",
    decided_at: null
  }
];

async function upsert(table, rows) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });

  if (error) {
    console.error(`${table}: ${error.message}`);
    process.exit(1);
  }

  console.log(`${table}: upserted ${rows.length}`);
}

await upsert("brands", brands);
await upsert("agents", agents);
await upsert("campaigns", campaigns);
await upsert("content_items", contentItems);
await upsert("approvals", approvals);

console.log("Supabase seed complete.");
