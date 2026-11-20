import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CALL_ESTIMATE, preflight, withCampaignBudget } from "@/lib/budget/model-budget";
import { defaultVault, recordLearning } from "@/lib/learning/vault";
import { jevSummary, planWithJev, type CampaignPlan } from "@/lib/marketing/simple-flow";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Mihai's Yes / Rework on a plan Jev still doubted. Both are saved to the learning notes. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = body?.decision;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (decision !== "yes" && decision !== "rework") return NextResponse.json({ error: "Decision must be yes or rework." }, { status: 400 });
  if (decision === "rework" && !reason) return NextResponse.json({ error: "Say what Crina should change." }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });
  const { data: row } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  const campaign = row as Campaign | null;
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const plan = (brief.plan ?? null) as CampaignPlan | null;
  if (!plan) return NextResponse.json({ error: "This campaign has no plan yet." }, { status: 409 });
  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", campaign.brand_id).maybeSingle();
  const brand = brandRow as Brand | null;
  const vault = defaultVault(brand?.name);
  const planText = `${plan.title}\n${plan.summary}\nKey message: ${plan.key_message}\nPlatforms: ${plan.platforms.join(", ")}\nCTA: ${plan.cta}`;

  if (decision === "yes") {
    await recordLearning(vault, { kind: "approved", part: "plan", campaign: plan.title, platform: plan.platforms.join(", "), agent: "Crina", reason: "", item: planText });
    await supabase.from("campaigns").update({ idea_brief: { ...brief, stage: "plan_ready", plan_approved_by: "human" } }).eq("id", id);
    revalidatePath("/marketing");
    return NextResponse.json({ stage: "plan_ready" });
  }

  const refused = await preflight(id, CALL_ESTIMATE.plan);
  if (refused) return NextResponse.json({ error: refused }, { status: 429 });
  await recordLearning(vault, { kind: "rejected", part: "plan", campaign: plan.title, platform: plan.platforms.join(", "), agent: "Crina", reason, item: planText });
  const outcome = await withCampaignBudget(id, () => planWithJev({ idea: String(brief.idea ?? campaign.objective), brand, platforms: plan.platforms, fixes: [`Mihai: ${reason}`], previous: plan }));
  await supabase
    .from("campaigns")
    .update({ idea_brief: { ...brief, stage: outcome.stage, plan: outcome.plan ?? plan, plan_jev: jevSummary(outcome.jev, outcome.doubts), plan_error: outcome.error } })
    .eq("id", id);
  revalidatePath("/marketing");
  return NextResponse.json({ stage: outcome.stage, plan: outcome.plan, error: outcome.error });
}
