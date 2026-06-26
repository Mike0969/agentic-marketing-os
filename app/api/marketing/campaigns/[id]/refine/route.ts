import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign } from "@/lib/types";

const refineSchema = {
  title: "Updated campaign title.",
  angle: "Updated core angle.",
  hook: "Updated scroll-stopping hook.",
  summary: "Updated 2-3 sentence summary.",
  rationale: "Why this revised idea works.",
  platforms: ["LinkedIn", "X", "Instagram", "Blog"],
  objective: "Updated objective.",
  target_audience: "Updated audience.",
  primary_cta: "Updated call to action."
};

// Operator sends an idea back to Crina with remarks; Crina returns a revised idea (still just an
// idea — nothing runs). The operator's remark is the steer.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { remarks?: string };
  const remarks = body.remarks?.trim();
  if (!remarks) return NextResponse.json({ error: "Add a remark so Crina knows what to change." }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Idea not found." }, { status: 404 });
  const { data: brand } = await supabase.from("brands").select("*").eq("id", (campaign as Campaign).brand_id).maybeSingle();

  const current = { title: (campaign as Campaign).title, objective: (campaign as Campaign).objective, ...((campaign as Campaign).idea_brief ?? {}) };

  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Refine Campaign Idea",
    instructions:
      "Revise this single campaign idea to address the operator's remarks. Keep it on-brand and conservative with claims. Do not start or execute anything — return only the revised idea.",
    outputSchema: refineSchema,
    input: { brand, current_idea: current, operator_remarks: remarks },
    brainFiles: ["content-formulas.md", "approval-rules.md"],
    temperature: 0.5,
    routeOrigin: "api.marketing.campaigns.refine"
  });

  const json = (run.json ?? {}) as Record<string, unknown>;
  const asArr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  const prev = ((campaign as Campaign).idea_brief ?? {}) as Record<string, unknown>;

  const nextBrief = {
    ...prev,
    angle: String(json.angle ?? prev.angle ?? ""),
    hook: String(json.hook ?? prev.hook ?? ""),
    summary: String(json.summary ?? prev.summary ?? ""),
    rationale: String(json.rationale ?? prev.rationale ?? ""),
    platforms: asArr(json.platforms).length ? asArr(json.platforms) : (prev.platforms ?? []),
    primary_cta: String(json.primary_cta ?? prev.primary_cta ?? ""),
    target_audience: String(json.target_audience ?? prev.target_audience ?? ""),
    last_refine_remark: remarks,
    fallback_used: !run.ok
  };
  const nextTitle = typeof json.title === "string" && json.title.trim() ? json.title.trim() : (campaign as Campaign).title;
  const nextObjective = typeof json.objective === "string" && json.objective.trim() ? json.objective.trim() : (campaign as Campaign).objective;

  const { data: updated, error } = await supabase
    .from("campaigns")
    .update({ title: nextTitle, objective: nextObjective, idea_brief: nextBrief })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Refine Campaign Idea",
    provider: run.provider,
    status: run.ok ? "success" : "fallback",
    input: { campaignId: id, brand: (brand as Brand)?.name ?? null, remarks, routeOrigin: "api.marketing.campaigns.refine" },
    output: { fallback_used: !run.ok, model: run.modelUsed },
    error: run.ok ? null : run.error ?? "Crina refine fell back.",
    model: run.modelUsed,
    durationMs: run.durationMs,
    brainResourcesUsed: run.brainResourcesUsed,
    providerResponseStatus: run.status
  });

  revalidatePath("/marketing/campaigns");
  return NextResponse.json({ campaign: updated, fallback: !run.ok });
}
