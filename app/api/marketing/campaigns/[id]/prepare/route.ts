import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { preflight, withCampaignBudget, STEP_AGENTS, times } from "@/lib/budget/model-budget";
import { prepareSupportAgents, type CampaignPlan } from "@/lib/marketing/simple-flow";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** After the plan is cleared: SEO brief + analytics note, then the content/visual run can start. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });
  const { data: row } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  const campaign = row as Campaign | null;
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const plan = (brief.plan ?? null) as CampaignPlan | null;
  if (!plan || brief.stage !== "plan_ready") return NextResponse.json({ error: "The plan is not cleared yet (Jev or Mihai must clear it first)." }, { status: 409 });
  const refused = await preflight(id, [...times(STEP_AGENTS.perPlatform, Math.max(1, plan.platforms.length)), ...STEP_AGENTS.runOverhead]);
  if (refused) return NextResponse.json({ error: refused }, { status: 429 });
  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", campaign.brand_id).maybeSingle();
  const support = await withCampaignBudget(id, () => prepareSupportAgents({ idea: String(brief.idea ?? campaign.objective), brand: brandRow as Brand | null, plan }));
  await supabase.from("campaigns").update({ status: "active", idea_brief: { ...brief, ...support, stage: "agents" } }).eq("id", id);
  return NextResponse.json({ stage: "agents", ...support });
}
