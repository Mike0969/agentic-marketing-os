import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { preflight, withCampaignBudget, STEP_AGENTS } from "@/lib/budget/model-budget";
import { cleanPlatforms, jevSummary, planWithJev } from "@/lib/marketing/simple-flow";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * New campaign, Mihai's simple flow: one idea (+ optional platforms and dates).
 * Creates the campaign, lets Crina write the plan and Jev check it.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  if (idea.length < 10) return NextResponse.json({ error: "Write your idea in a sentence or two." }, { status: 400 });
  const platforms = cleanPlatforms(body?.platforms);
  const start = isDate(body?.start_date) ? body.start_date : null;
  const end = isDate(body?.end_date) ? body.end_date : null;
  if (start && end && end < start) return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const refused = await preflight(null, STEP_AGENTS.plan);
  if (refused) return NextResponse.json({ error: refused }, { status: 429 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const brandQuery = typeof body?.brand_id === "string" && body.brand_id ? supabase.from("brands").select("*").eq("id", body.brand_id) : supabase.from("brands").select("*").eq("active", true).order("name").limit(1);
  const { data: brandRows } = await brandQuery;
  const brand = ((brandRows ?? [])[0] ?? null) as Brand | null;
  if (!brand) return NextResponse.json({ error: "No active brand. Add one under More → Brands." }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const plus14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      brand_id: brand.id,
      title: idea.slice(0, 60),
      objective: idea,
      target_audience: brand.target_audience || "To be set by Crina",
      start_date: start ?? today,
      end_date: end ?? plus14,
      status: "planning",
      idea_brief: { flow: "simple", idea, platforms, schedule: start ? { start } : {}, stage: "planning" }
    })
    .select("*")
    .single();
  if (error || !campaign) return NextResponse.json({ error: error?.message ?? "Campaign was not created." }, { status: 500 });

  const outcome = await withCampaignBudget(campaign.id, () => planWithJev({ idea, brand, platforms, campaignId: campaign.id }));
  const brief = {
    ...(campaign.idea_brief as Record<string, unknown>),
    stage: outcome.stage,
    plan: outcome.plan,
    plan_jev: jevSummary(outcome.jev, outcome.doubts),
    plan_error: outcome.error,
    platforms: outcome.plan?.platforms ?? platforms,
    primary_cta: outcome.plan?.cta ?? null,
    success_criteria: outcome.plan?.success_criteria ?? null,
    summary: outcome.plan?.summary ?? null
  };
  await supabase
    .from("campaigns")
    .update({
      idea_brief: brief,
      ...(outcome.plan ? { title: outcome.plan.title, objective: outcome.plan.objective, target_audience: outcome.plan.target_audience || campaign.target_audience } : {})
    })
    .eq("id", campaign.id);
  await supabase.from("activity").insert(makeActivity("Campaign idea", `Crina planned "${outcome.plan?.title ?? idea.slice(0, 60)}" (${outcome.stage}).`));

  revalidatePath("/marketing");
  return NextResponse.json({ campaign_id: campaign.id, stage: outcome.stage, plan: outcome.plan, jev: brief.plan_jev, error: outcome.error }, { status: 201 });
}
