import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runHermesAgent } from "@/lib/agents/hermes-client";
import { readLocalDashboardData, updateLocalContentItem } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem } from "@/lib/types";

type DraftOutput = {
  title: string;
  hook: string;
  body: string;
  CTA: string;
  editorNotes: string;
};

const outputSchema = {
  title: "Improved content title.",
  hook: "Strong opening hook for the selected platform.",
  body: "Draft copy. Keep it useful, brand-safe, and platform-aware.",
  CTA: "One clear CTA.",
  editorNotes: "Short note explaining strategy and any claim/approval risk."
};

function normalizeDraft(value: unknown): DraftOutput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const hook = typeof raw.hook === "string" ? raw.hook.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  const CTA = typeof raw.CTA === "string" ? raw.CTA.trim() : typeof raw.cta === "string" ? raw.cta.trim() : "";
  const editorNotes = typeof raw.editorNotes === "string" ? raw.editorNotes.trim() : "";
  if (!title || !hook || !body || !CTA) return null;
  return { title, hook, body, CTA, editorNotes };
}

function deterministicDraft(item: ContentItem, brand: Brand | null, reason: string): DraftOutput {
  const tone = brand?.tone_of_voice ?? "professional and direct";
  const audience = brand?.target_audience ?? "the target audience";
  return {
    title: item.title,
    hook: item.hook || `The market is asking a sharper question about ${item.title}.`,
    body: `${item.body || item.title}\n\nFrame this for ${audience}. Keep the tone ${tone}. Add verified proof before final approval. This deterministic draft was generated because Hermes was unavailable: ${reason}`,
    CTA: item.CTA || brand?.reusable_ctas?.split(/[;\n,]/)[0]?.trim() || "Request more information",
    editorNotes: `FALLBACK: Hermes did not return a valid draft. Reason: ${reason}`
  };
}

function agentForItem(item: ContentItem) {
  const assigned = item.assigned_agent.toLowerCase();
  if (assigned.includes("seo")) return { id: "agent-seo", name: "SEO Agent", role: "Search Strategy" };
  if (assigned.includes("competitor")) return { id: "agent-competitor-intelligence", name: "Competitor Intelligence Agent", role: "Market Monitoring" };
  if (assigned.includes("visual")) return { id: "agent-visual-video", name: "Visual & Video Agent", role: "Creative Production" };
  return { id: "agent-content-creator", name: "Content Creator Agent", role: "Copy and Editorial" };
}

async function readContext(id: string): Promise<{ item: ContentItem; brand: Brand | null; campaign: Campaign | null } | null> {
  if (!isSupabaseConfigured()) {
    const data = await readLocalDashboardData();
    const item = data.contentItems.find((contentItem) => contentItem.id === id);
    if (!item) return null;
    return {
      item,
      brand: data.brands.find((brand) => brand.id === item.brand_id) ?? null,
      campaign: data.campaigns.find((campaign) => campaign.id === item.campaign_id) ?? null
    };
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const [{ data: item }, { data: brands }, { data: campaigns }] = await Promise.all([
    supabase.from("content_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("brands").select("*"),
    supabase.from("campaigns").select("*")
  ]);

  if (!item) return null;
  const contentItem = item as ContentItem;
  return {
    item: contentItem,
    brand: ((brands ?? []) as Brand[]).find((brand) => brand.id === contentItem.brand_id) ?? null,
    campaign: ((campaigns ?? []) as Campaign[]).find((campaign) => campaign.id === contentItem.campaign_id) ?? null
  };
}

async function writeDraft(id: string, draft: DraftOutput, fallback: boolean, agentName: string, error: string | null) {
  const patch: Partial<ContentItem> = {
    title: draft.title,
    hook: draft.hook,
    body: draft.body,
    CTA: draft.CTA,
    status: "draft",
    approval_status: "not_requested",
    assigned_agent: agentName,
    performance_summary: fallback ? `FALLBACK: ${draft.editorNotes || error || "Deterministic draft generated."}` : `Hermes draft generated. ${draft.editorNotes}`
  };

  if (!isSupabaseConfigured()) {
    return updateLocalContentItem(id, patch, "Agent draft created", `${draft.title} moved to Draft.`);
  }

  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error: updateError } = await supabase.from("content_items").update(patch).eq("id", id).select("*").single();
  if (updateError) return null;
  return data as ContentItem;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const contextData = await readContext(id);
  if (!contextData) return NextResponse.json({ error: "Content item not found." }, { status: 404 });

  const { item, brand, campaign } = contextData;
  const agent = agentForItem(item);
  const result = await runHermesAgent({
    agentId: agent.id,
    fallbackAgentName: agent.name,
    fallbackRole: agent.role,
    task: "Create Pipeline Draft",
    instructions:
      "Turn the idea/brief into a useful draft. Do not publish, schedule, or approve. Keep claims conservative and flag approval risks in editorNotes.",
    outputSchema,
    input: { contentItem: item, brand, campaign },
    brainFiles: ["brand-briefs.md", "brand-voice.md", "content-formulas.md", "approval-rules.md", "reusable-ctas.md"],
    temperature: 0.35
  });

  const hermesDraft = normalizeDraft(result.json);
  const fallback = !result.ok || !hermesDraft;
  const draft = fallback ? deterministicDraft(item, brand, result.error ?? "Invalid Hermes draft JSON.") : hermesDraft;
  const provider = fallback ? "deterministic" : "hermes";
  const error = fallback ? result.error ?? "Hermes returned invalid draft JSON." : null;
  const updated = await writeDraft(id, draft, fallback, agent.name, error);

  await recordAgentRun({
    agentName: agent.name,
    agentId: agent.id,
    workflowName: "Create Pipeline Draft",
    provider,
    status: fallback ? "fallback" : "success",
    input: { contentItemId: item.id, title: item.title, brand: brand?.name ?? null, campaign: campaign?.title ?? null },
    output: draft as unknown as Record<string, unknown>,
    error,
    model: result.modelUsed,
    backupModel: result.backupModel,
    tokensPrompt: result.usage.tokensPrompt,
    tokensCompletion: result.usage.tokensCompletion,
    tokensTotal: result.usage.tokensTotal,
    durationMs: result.durationMs,
    brainResourcesUsed: result.brainResourcesUsed,
    providerResponseStatus: result.status
  });

  if (!updated) return NextResponse.json({ error: "Draft was generated but could not be saved." }, { status: 500 });

  revalidatePath("/marketing/pipeline");
  revalidatePath("/marketing");
  return NextResponse.json({ contentItem: updated, output: draft, fallback, provider, error });
}
