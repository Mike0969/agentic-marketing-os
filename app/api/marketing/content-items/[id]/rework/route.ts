import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAgentAccess } from "@/lib/auth";
import { sendCrinaReadyToPostPings } from "@/lib/marketing/crina-telegram";
import { getFeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { routeFromTags } from "@/lib/marketing/reject-reasons";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem } from "@/lib/types";

const contentSchema = { title: "string", hook: "string", body: "improved platform post text", cta: "string", hashtags: ["#tag"] };

// Classify the operator's remark: is it about the image, the text, or both?
function classify(remark: string): { visual: boolean; content: boolean } {
  const r = remark.toLowerCase();
  const visual = /image|visual|photo|picture|video|carousel|design|colou?r|graphic|thumbnail|render|art/.test(r);
  const content = /text|hook|caption|word|copy|tone|messag|hashtag|headline|title|cta|wording|grammar|claim|boring|generic|weak/.test(r);
  if (!visual && !content) return { visual: false, content: true }; // default: text
  return { visual, content };
}

function normPost(json: unknown, platform: string) {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  const body = typeof d.body === "string" ? d.body.trim() : "";
  if (!body) return null;
  return {
    title: String(d.title ?? `${platform} post`).trim(),
    hook: String(d.hook ?? "").trim(),
    body,
    cta: String(d.cta ?? d.CTA ?? "Learn more").trim(),
    hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String).filter(Boolean).slice(0, 8) : []
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { remark?: string; tags?: string[] };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
  const remark = body.remark?.trim() || tags.join("; ");
  if (!remark) return NextResponse.json({ error: "A reason chip or remark is required so Crina knows what to fix." }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: itemRow } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
  const item = itemRow as ContentItem | null;
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", item.brand_id).maybeSingle();
  const brand = brandRow as Brand | null;
  const { data: campaignRow } = item.campaign_id ? await supabase.from("campaigns").select("*").eq("id", item.campaign_id).maybeSingle() : { data: null };
  const campaign = campaignRow as Campaign | null;

  // Routing: preset reason chips are authoritative; otherwise classify the free-text remark.
  let route = classify(remark);
  if (tags.length) {
    const fromTags = routeFromTags(tags);
    if (fromTags.visual || fromTags.content) route = fromTags;
  }
  const memory = await getFeedbackMemoryContext({ brandId: item.brand_id, platform: item.platform });
  const routedTo: string[] = [];
  const patch: Record<string, unknown> = {};
  let provider = "";
  let model: string | null = null;

  // Content rework (text/hook/caption) with Crina-aware regeneration.
  if (route.content) {
    const gen = await runMarketingAgentModel({
      agentId: "agent-content-creator",
      fallbackAgentName: "Content Creator Agent",
      fallbackRole: "Copy and Editorial",
      task: `Rework ${item.platform} post`,
      instructions: `The operator REJECTED this ${item.platform} post and said: "${remark}". Rewrite it to fix exactly that, keeping brand voice and ${item.platform} format. Make it clearly better, not a small tweak.\n\nPast approved/rejected memory:\nApproved: ${memory.approved.map((a) => a.summary).join(" | ") || "none"}\nRejected: ${memory.rejected.map((a) => `${a.summary}${a.reason ? ` (${a.reason})` : ""}`).join(" | ") || "none"}`,
      outputSchema: contentSchema,
      input: { brand, platform: item.platform, current: { title: item.title, hook: item.hook, body: item.body, cta: item.CTA }, operator_remark: remark, campaign_idea: campaign?.idea_brief ?? null },
      brainFiles: ["content-formulas.md", "approval-rules.md"],
      temperature: 0.5,
      routeOrigin: "api.marketing.content-items.rework"
    });
    provider = gen.provider;
    model = gen.modelUsed;
    const np = normPost(gen.json, item.platform);
    if (np) {
      patch.title = np.title;
      patch.hook = np.hook;
      patch.body = np.body;
      patch.CTA = np.cta;
      patch.ready_package = { ...((item.ready_package as Record<string, unknown>) ?? {}), title: np.title, text: np.body, caption: np.body, hashtags: np.hashtags };
    }
    routedTo.push("Content");
  }

  // Visual rework (regenerate the image addressing the remark).
  if (route.visual) {
    const prompt = `Professional ${item.platform} visual for ${brand?.name ?? "the brand"}. Concept: ${item.title}. Operator feedback to address: ${remark}. Clean, brand-safe, high detail, no text in the image.`;
    const image = await generateMarketingImage(prompt, { contentItemId: id, position: 1, kind: "image" });
    patch.visual_asset_url = image.url;
    patch.visual_asset_status = image.status;
    patch.ready_package = { ...((patch.ready_package as Record<string, unknown>) ?? (item.ready_package as Record<string, unknown>) ?? {}), image_provider: image.provider };
    routedTo.push("Visual");
  }

  // Re-queue at the human gate so the new version reappears + re-pings.
  patch.status = "approval";
  patch.approval_status = "pending";
  patch.workflow_stage = "human_final_approval";
  patch.notified_at = null;
  patch.human_feedback_tags = tags.length ? tags : null;
  patch.performance_summary = `Reworked by ${routedTo.join(" + ") || "Content"} after your remark: "${remark}".`;

  const { error: updErr } = await supabase.from("content_items").update(patch).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Learning: store the rejection + remark so future generations avoid it (brand+platform scoped).
  await supabase.from("feedback_memory").insert({
    agent_id: route.visual && !route.content ? "agent-visual-video" : "agent-content-creator",
    content_type: item.content_type,
    content_summary: item.title,
    content_full: { brand_id: item.brand_id, platform: item.platform, content_type: item.content_type, tags },
    decision: "rejected",
    reason: remark,
    decided_by: "human",
    loop_iteration: 1
  });

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Rework Post (operator reject)",
    provider: provider || "internal",
    status: "success",
    input: { contentItemId: id, platform: item.platform, remark, routedTo, routeOrigin: "api.marketing.content-items.rework" },
    output: { routedTo },
    error: null,
    model,
    durationMs: 0
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const notifications = item.campaign_id ? await sendCrinaReadyToPostPings({ campaignIds: [item.campaign_id], baseUrl }) : null;

  const { data: updated } = await supabase.from("content_items").select("*").eq("id", id).single();
  revalidatePath("/marketing/ready-to-post");
  return NextResponse.json({ contentItem: updated, routedTo, notifications });
}
