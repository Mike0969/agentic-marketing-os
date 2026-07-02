import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAgentAccess } from "@/lib/auth";
import { sendCrinaReadyToPostPings } from "@/lib/marketing/crina-telegram";
import { composeCarouselSlide } from "@/lib/marketing/carousel-composer";
import { getFeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { getPlatformPlan, type NativeDraft } from "@/lib/marketing/platform-generation";
import { saveContentAssets } from "@/lib/marketing/ready-package";
import { routeFromTags } from "@/lib/marketing/reject-reasons";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem, ReadyPackageAsset } from "@/lib/types";

type VisualDirection = {
  concept: string;
  prompt: string;
  negative: string;
};

const visualDirectionSchema = {
  concept: "materially new visual concept, one sentence",
  prompt: "image generation prompt for the new direction",
  negative: "what to avoid from the rejected attempt"
};

// Classify the operator's remark: is it about the image, the text, or both?
function classify(remark: string): { visual: boolean; content: boolean } {
  const r = remark.toLowerCase();
  const visual = /image|visual|photo|picture|video|carousel|design|colou?r|graphic|thumbnail|render|art/.test(r);
  const content = /text|hook|caption|word|copy|tone|messag|hashtag|headline|title|cta|wording|grammar|claim|boring|generic|weak/.test(r);
  if (!visual && !content) return { visual: false, content: true }; // default: text
  return { visual, content };
}

function normalizeVisualDirection(value: unknown): VisualDirection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const concept = typeof data.concept === "string" ? data.concept.trim() : "";
  const prompt = typeof data.prompt === "string" ? data.prompt.trim() : "";
  const negative = typeof data.negative === "string" ? data.negative.trim() : "";
  if (!prompt) return null;
  return { concept, prompt, negative };
}

function rejectedAssetContext(item: ContentItem) {
  const assets = item.ready_package?.assets ?? [];
  return {
    visual_asset_url: item.visual_asset_url,
    previous_prompts: assets.map((asset) => asset.prompt).filter(Boolean).slice(0, 7),
    previous_package: {
      title: item.ready_package?.title ?? item.title,
      text: item.ready_package?.text ?? item.body,
      slides: item.ready_package?.slides ?? null
    }
  };
}

async function makeVisualDirection(args: {
  item: ContentItem;
  brand: Brand | null;
  campaign: Campaign | null;
  platform: string;
  remark: string;
  memory: Awaited<ReturnType<typeof getFeedbackMemoryContext>>;
}) {
  const run = await runMarketingAgentModel({
    agentId: "agent-visual-video",
    fallbackAgentName: "Visual & Video Agent",
    fallbackRole: "Creative Direction",
    task: `Create a materially new ${args.platform} visual direction`,
    instructions: `The operator rejected the current visual and said: "${args.remark}".

Create a NEW visual direction that is materially different from the rejected asset. Do not make a tiny tweak.

Rules:
- If the operator says the image is weak/generic/bad, change composition, subject, lighting, camera distance, and focal point.
- For GridFactory: use credible, photorealistic energy infrastructure, substations, modular data-center hardware, power corridors, service roads, transformers, cooling equipment, real steel/concrete/cables. Avoid cartoon AI, neon sci-fi, generic server-room stock, abstract glowing brains, and fake logos.
- For Gulf-EL/NexRide: use credible GCC mobility/EV/fleet/service scenes, not fantasy sci-fi or meme styling.
- Image model should create the background/scene only; carousel text will be rendered by the app.
- Return a prompt that is specific enough to force a different result.

Past approved/rejected memory:
Approved: ${args.memory.approved.map((a) => a.summary).join(" | ") || "none"}
Rejected: ${args.memory.rejected.map((a) => `${a.summary}${a.reason ? ` (${a.reason})` : ""}`).join(" | ") || "none"}`,
    outputSchema: visualDirectionSchema,
    input: {
      brand: args.brand,
      campaign_idea: args.campaign?.idea_brief ?? null,
      current: rejectedAssetContext(args.item),
      operator_remark: args.remark
    },
    brainFiles: ["agent-visual-video-memory.md", "approval-rules.md"],
    temperature: 0.8,
    routeOrigin: "api.marketing.content-items.rework.visual-direction"
  });
  return {
    direction: normalizeVisualDirection(run.json),
    provider: run.provider,
    model: run.modelUsed
  };
}

function carouselPrompt(item: ContentItem, brand: Brand | null, draft: NativeDraft | null, position: number, total: number, remark: string, direction: VisualDirection | null) {
  const slide = draft?.slides?.[position - 1] ?? item.ready_package?.slides?.[position - 1];
  return [
    `Instagram carousel slide ${position} of ${total} for ${brand?.name ?? "the brand"}.`,
    direction?.prompt ? `New creative direction: ${direction.prompt}.` : null,
    `Slide headline: ${slide?.headline || draft?.hook || item.hook || item.title}.`,
    slide?.text ? `Slide message: ${slide.text}.` : null,
    `Operator feedback to address visually: ${remark}.`,
    direction?.negative ? `Avoid: ${direction.negative}.` : null,
    "Premium photorealistic infrastructure visual, clean composition, on-brand, high detail, no readable text in the image."
  ]
    .filter(Boolean)
    .join(" ");
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
  const plan = getPlatformPlan(item.platform);
  const routedTo: string[] = [];
  const patch: Record<string, unknown> = {};
  let provider = "";
  let model: string | null = null;
  let draft: NativeDraft | null = null;

  // Content rework (text/hook/caption) with Crina-aware regeneration.
  if (route.content) {
    const gen = await runMarketingAgentModel({
      agentId: "agent-content-creator",
      fallbackAgentName: "Content Creator Agent",
      fallbackRole: "Copy and Editorial",
      task: `Rework ${item.platform} post`,
      instructions: `The operator REJECTED this ${item.platform} package and said: "${remark}". Rewrite it to fix exactly that, keeping brand voice and the native ${item.platform} format.\n\n${plan.contentInstructions}\n\nFor Instagram carousel, return final audience-facing caption + slides only. Never return image prompts, visual directions, or "carousel draft" copy as the caption.\n\nPast approved/rejected memory:\nApproved: ${memory.approved.map((a) => a.summary).join(" | ") || "none"}\nRejected: ${memory.rejected.map((a) => `${a.summary}${a.reason ? ` (${a.reason})` : ""}`).join(" | ") || "none"}`,
      outputSchema: plan.contentSchema,
      input: { brand, platform: item.platform, current: { title: item.title, hook: item.hook, body: item.body, cta: item.CTA, ready_package: item.ready_package }, operator_remark: remark, campaign_idea: campaign?.idea_brief ?? null },
      brainFiles: ["content-formulas.md", "approval-rules.md"],
      temperature: 0.5,
      routeOrigin: "api.marketing.content-items.rework"
    });
    provider = gen.provider;
    model = gen.modelUsed;
    const np = plan.normalize(gen.json);
    if (np) {
      draft = np;
      const nextPackage = {
        ...((item.ready_package as Record<string, unknown>) ?? {}),
        title: np.title,
        text: np.body,
        caption: np.body,
        hashtags: np.hashtags,
        slides: np.slides,
        script: np.script,
        storyboard: np.storyboard
      };
      patch.title = np.title;
      patch.hook = np.hook;
      patch.body = np.body;
      patch.CTA = np.cta;
      patch.ready_package = nextPackage;
    }
    routedTo.push("Content");
  }

  // Visual rework (regenerate the image addressing the remark).
  if (route.visual) {
    const visual = await makeVisualDirection({ item, brand, campaign, platform: item.platform, remark, memory });
    if (visual.provider) provider = visual.provider;
    if (visual.model) model = visual.model;
    const direction = visual.direction;

    if (plan.assetKind === "carousel") {
      const slides = draft?.slides ?? item.ready_package?.slides ?? [];
      const total = Math.min(Math.max(slides.length, plan.carouselCount, 3), 7);
      const assets: ReadyPackageAsset[] = [];
      for (let i = 0; i < total; i += 1) {
        const prompt = carouselPrompt(item, brand, draft, i + 1, total, remark, direction);
        const image = await generateMarketingImage(prompt, { contentItemId: id, position: i + 1, kind: "carousel_slide", aspect: "square" });
        const slide = draft?.slides?.[i] ?? item.ready_package?.slides?.[i];
        const composedUrl = await composeCarouselSlide({
          backgroundUrl: image.url,
          contentItemId: id,
          position: i + 1,
          total,
          brandName: brand?.name,
          headline: slide?.headline || draft?.hook || item.hook || item.title,
          text: slide?.text
        });
        assets.push({ kind: "carousel_slide", url: composedUrl ?? image.url, prompt, position: i + 1, model: image.model, provider: image.provider, status: image.status, error: image.error });
      }
      await saveContentAssets(id, assets);
      patch.visual_asset_url = assets[0]?.url ?? null;
      patch.visual_asset_status = assets[0]?.status ?? "placeholder";
      patch.ready_package = { ...((patch.ready_package as Record<string, unknown>) ?? (item.ready_package as Record<string, unknown>) ?? {}), assets, image_provider: assets[0]?.provider, visual_direction: direction };
    } else {
      const prompt = [
        `Professional ${item.platform} visual for ${brand?.name ?? "the brand"}.`,
        direction?.prompt ? `New creative direction: ${direction.prompt}.` : `Concept: ${draft?.title ?? item.title}.`,
        `Operator feedback to address: ${remark}.`,
        direction?.negative ? `Avoid: ${direction.negative}.` : null,
        "Clean, brand-safe, high detail, no readable text in the image."
      ]
        .filter(Boolean)
        .join(" ");
      const image = await generateMarketingImage(prompt, { contentItemId: id, position: 1, kind: "image", aspect: plan.key === "x" || plan.key === "linkedin" ? "landscape" : "square" });
      patch.visual_asset_url = image.url;
      patch.visual_asset_status = image.status;
      patch.ready_package = { ...((patch.ready_package as Record<string, unknown>) ?? (item.ready_package as Record<string, unknown>) ?? {}), image_provider: image.provider, visual_direction: direction };
    }
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
