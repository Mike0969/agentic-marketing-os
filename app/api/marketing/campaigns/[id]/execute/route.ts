import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { appendLocalContentItems, readLocalDashboardData } from "@/lib/local-store";
import { requireAdmin } from "@/lib/auth";
import { acquireCampaignAutomationLock, releaseCampaignAutomationLock } from "@/lib/marketing/campaign-automation";
import { getFeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem } from "@/lib/types";

type CampaignSeedItem = {
  platform: string;
  content_type: string;
  title: string;
  hook: string;
  body: string;
  CTA: string;
  assigned_agent: string;
  status?: "idea" | "brief";
};

type CampaignSeedOutput = {
  campaign_summary: string;
  items: CampaignSeedItem[];
  crina_notes: string;
};

const outputSchema = {
  campaign_summary: "Short strategic summary of the full campaign plan.",
  items: [
    {
      platform: "LinkedIn | X | Instagram | Facebook | Blog | TikTok | YouTube",
      content_type: "Post, article, carousel, video script, thread, or campaign brief.",
      title: "Clear operator-readable idea title.",
      hook: "Opening hook.",
      body: "Brief direction for the agent who will produce the draft.",
      CTA: "One clear CTA.",
      assigned_agent: "Content Creator Agent | SEO Agent | Visual & Video Agent | Competitor Intelligence Agent",
      status: "idea | brief"
    }
  ],
  crina_notes: "Notes about why this plan was selected, how the agents should execute, and what the operator should review later."
};

function firstObjectiveLine(objective: string) {
  return objective
    .replace(/^Objective:\s*/i, "")
    .split(/\n\s*(Source material \/ notes:|Platforms:|Primary CTA \/ offer:)/i)[0]
    .trim();
}

function parsePlatforms(objective: string) {
  const match = objective.match(/Platforms:\s*([\s\S]*?)(?:\n\n|Primary CTA \/ offer:|$)/i);
  const raw = match?.[1] ?? "LinkedIn, Blog, X";
  return raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function parseCTA(objective: string, brand: Brand | null) {
  const match = objective.match(/Primary CTA \/ offer:\s*([\s\S]*?)(?:\n\n|$)/i);
  return match?.[1]?.trim() || brand?.ctas?.split(/[;\n,]/)[0]?.trim() || "Learn more";
}

function normalizeItems(value: unknown): CampaignSeedItem[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as { items?: unknown };
  if (!Array.isArray(raw.items)) return [];

  const items: CampaignSeedItem[] = [];
  for (const item of raw.items) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const hook = typeof data.hook === "string" ? data.hook.trim() : "";
    const body = typeof data.body === "string" ? data.body.trim() : "";
    const CTA = typeof data.CTA === "string" ? data.CTA.trim() : typeof data.cta === "string" ? data.cta.trim() : "";
    if (!title || !hook || !body || !CTA) continue;
    items.push({
      platform: typeof data.platform === "string" ? data.platform.trim() : "LinkedIn",
      content_type: typeof data.content_type === "string" ? data.content_type.trim() : "Campaign idea",
      title,
      hook,
      body,
      CTA,
      assigned_agent: typeof data.assigned_agent === "string" ? data.assigned_agent.trim() : "Content Creator Agent",
      status: data.status === "brief" ? "brief" : "idea"
    });
  }

  return items.slice(0, 7);
}

function deterministicItems(campaign: Campaign, brand: Brand | null): CampaignSeedItem[] {
  const objective = firstObjectiveLine(campaign.objective);
  const platforms = parsePlatforms(campaign.objective);
  const cta = parseCTA(campaign.objective, brand);

  return platforms.slice(0, 4).map((platform, index) => ({
    platform,
    content_type: platform.toLowerCase().includes("blog") ? "SEO article brief" : index === 0 ? "Campaign anchor post" : "Platform post",
    title: `${campaign.title}: ${platform} angle`,
    hook: objective || campaign.title,
    body: `Crina campaign plan for ${brand?.name ?? "the selected brand"}: turn the approved objective into a ${platform} execution piece focused on ${objective || campaign.title}. Include the angle, draft direction, proof requirement, visual/video note when relevant, and final human approval requirement.`,
    CTA: cta,
    assigned_agent: platform.toLowerCase().includes("blog") ? "SEO Agent" : "Content Creator Agent",
    status: index === 0 ? "brief" : "idea"
  }));
}

function toContentItems(args: {
  items: CampaignSeedItem[];
  campaign: Campaign;
  brand: Brand | null;
  fallback: boolean;
  provider: string;
  model: string | null;
  crinaNotes: string;
}) {
  return args.items.map((item, index) => ({
    id: `content-${args.campaign.id}-${Date.now()}-${index}`,
    brand_id: args.campaign.brand_id,
    campaign_id: args.campaign.id,
    platform: item.platform,
    content_type: item.content_type,
    title: item.title,
    body: item.body,
    hook: item.hook,
    CTA: item.CTA,
    status: item.status ?? "idea",
    assigned_agent: item.assigned_agent,
    approval_status: "not_requested",
    scheduled_at: null,
    published_at: null,
    performance_summary: `${args.fallback ? "FALLBACK: " : ""}Campaign plan by Crina. Campaign execution seed by Crina. Provider: ${args.provider}/${args.model ?? "default"}. ${args.crinaNotes}`,
    workflow_stage: "content_creation",
    current_owner: item.assigned_agent,
    next_owner: "Crina",
    human_feedback_tags: null,
    crina_review_notes: args.crinaNotes,
    agent_handoff_summary: `Crina created this from approved campaign direction for ${args.brand?.name ?? "selected brand"}.`,
    loop_iteration: 0
  })) satisfies ContentItem[];
}

async function readCampaignContext(id: string) {
  if (!isSupabaseConfigured()) {
    const data = await readLocalDashboardData();
    const campaign = data.campaigns.find((item) => item.id === id) ?? null;
    const brand = campaign ? data.brands.find((item) => item.id === campaign.brand_id) ?? null : null;
    const existing = data.contentItems.filter((item) => item.campaign_id === id && item.performance_summary?.includes("Campaign execution seed by Crina"));
    return { campaign, brand, existing };
  }

  const supabase = await createClient();
  if (!supabase) return { campaign: null, brand: null, existing: [] as ContentItem[] };

  const [{ data: campaign }, { data: brands }, { data: existing }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase.from("brands").select("*"),
    supabase.from("content_items").select("*").eq("campaign_id", id).ilike("performance_summary", "%Campaign execution seed by Crina%")
  ]);

  const typedCampaign = (campaign as Campaign | null) ?? null;
  return {
    campaign: typedCampaign,
    brand: typedCampaign ? ((brands ?? []) as Brand[]).find((item) => item.id === typedCampaign.brand_id) ?? null : null,
    existing: (existing ?? []) as ContentItem[]
  };
}

async function executeCampaignPlan(id: string) {
  const { campaign, brand, existing } = await readCampaignContext(id);

  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.status !== "active") {
    return NextResponse.json({ error: "Campaign direction must be approved before Crina can execute it." }, { status: 409 });
  }
  if (existing.length) {
    return NextResponse.json({ contentItems: existing, alreadyStarted: true, message: "Crina already created pipeline items for this campaign." });
  }

  const feedbackMemory = await getFeedbackMemoryContext({ brandId: campaign.brand_id });
  const result = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Create Campaign Plan For Execution",
    instructions:
      "Read the approved campaign objective and create the complete first campaign plan for execution. Produce 4-7 campaign pieces that cover the requested platforms, campaign angles, draft direction, visual/video needs when relevant, and CTA. Keep the brand scope strict: use only the provided brand object and campaign. Do not borrow claims, CTAs, tone, or positioning from any other brand. Do not publish, schedule, or mark anything approved.",
    outputSchema,
    input: { campaign, brand, feedbackMemory },
    brainFiles: ["workflow-contract.md", "voice-calendar-memory.md", "approval-rules.md"],
    temperature: 0.35,
    routeOrigin: "api.marketing.campaigns.execute"
  });

  const modelItems = normalizeItems(result.json);
  const fallback = !result.ok || !modelItems.length;
  const crinaNotes =
    !fallback && result.json && typeof result.json === "object" && "crina_notes" in result.json
      ? String((result.json as Record<string, unknown>).crina_notes)
      : fallback
        ? `FALLBACK: ${result.error ?? "Crina returned invalid campaign seed JSON."}`
        : "Crina created initial campaign execution items.";
  const contentItems = toContentItems({
    items: fallback ? deterministicItems(campaign, brand) : modelItems,
    campaign,
    brand,
    fallback,
    provider: result.provider,
    model: result.modelUsed,
    crinaNotes
  });

  let saved: ContentItem[] = [];

  if (!isSupabaseConfigured()) {
    saved = await appendLocalContentItems(contentItems);
  } else {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

    const insertRows = contentItems.map(({ id: _id, ...item }) => item);
    const { data, error } = await supabase.from("content_items").insert(insertRows).select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = (data ?? []) as ContentItem[];
  }

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Create Campaign Plan For Execution",
    provider: result.provider,
    status: fallback ? "fallback" : "success",
    input: { campaignId: campaign.id, campaignTitle: campaign.title, brand: brand?.name ?? null, feedbackMemory, routeOrigin: "api.marketing.campaigns.execute" },
    output: { items_created: saved.length, fallback_used: fallback, provider: result.provider, model: result.modelUsed, crina_notes: crinaNotes },
    error: fallback ? result.error ?? "Invalid campaign seed JSON." : null,
    model: result.modelUsed,
    tokensPrompt: result.usage.tokensPrompt,
    tokensCompletion: result.usage.tokensCompletion,
    tokensTotal: result.usage.tokensTotal,
    durationMs: result.durationMs,
    brainResourcesUsed: result.brainResourcesUsed,
    providerResponseStatus: result.status
  });

  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing/pipeline");
  revalidatePath("/marketing");

  return NextResponse.json({ contentItems: saved, fallback, provider: result.provider, model: result.modelUsed, crinaNotes });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const lockAlreadyHeld = request.headers.get("x-campaign-automation-lock-held") === "campaign-start-wrapper";
  if (lockAlreadyHeld) return executeCampaignPlan(id);

  const lock = await acquireCampaignAutomationLock(id);
  if (!lock.ok) {
    const reason = "reason" in lock ? lock.reason : "error" in lock ? lock.error : "already running";
    return NextResponse.json({ skipped: true, reason }, { status: lock.status });
  }

  try {
    const response = await executeCampaignPlan(id);
    await releaseCampaignAutomationLock(id, response.ok ? "idle" : "needs_attention", {
      error: response.ok ? null : "Crina campaign plan creation failed."
    });
    return response;
  } catch (error) {
    await releaseCampaignAutomationLock(id, "needs_attention", { error: error instanceof Error ? error.message : "Crina campaign plan creation failed." });
    throw error;
  }
}
