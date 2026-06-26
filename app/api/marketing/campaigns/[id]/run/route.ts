import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAgentAccess } from "@/lib/auth";
import { sendCrinaReadyToPostPings } from "@/lib/marketing/crina-telegram";
import { getFeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign } from "@/lib/types";

const MAX_CRINA_ROUNDS = 2;
const MAX_PLATFORMS = 4; // bound per request to stay under serverless timeouts

type PostDraft = { title: string; hook: string; body: string; cta: string; hashtags: string[] };

const contentSchema = { title: "string", hook: "string", body: "platform-tailored post text", cta: "string", hashtags: ["#tag"] };
const reviewSchema = { decision: "approve | rework", reason: "string", improvements: ["specific fix for the content agent"] };

function memoryText(m: { approved: Array<{ summary: string; reason: string | null }>; rejected: Array<{ summary: string; reason: string | null }> }) {
  const a = m.approved.map((x) => `+ ${x.summary}${x.reason ? ` (${x.reason})` : ""}`).join("\n") || "+ none yet";
  const r = m.rejected.map((x) => `- ${x.summary}${x.reason ? ` (${x.reason})` : ""}`).join("\n") || "- none yet";
  return `Human-approved before:\n${a}\nHuman-rejected before (avoid these):\n${r}`;
}

function normalizePost(json: unknown, platform: string): PostDraft | null {
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
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: campaignRow } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  const campaign = campaignRow as Campaign | null;
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", campaign.brand_id).maybeSingle();
  const brand = brandRow as Brand | null;

  const idea = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const platforms = (Array.isArray(idea.platforms) ? (idea.platforms as string[]) : ["LinkedIn"]).slice(0, MAX_PLATFORMS);
  const schedule = (idea.schedule ?? {}) as { start?: string; from_hour?: string };
  const scheduledAt = schedule.start ? `${schedule.start}T${schedule.from_hour || "09:00"}:00` : null;

  // Mark the campaign as working (no stages).
  await supabase.from("campaigns").update({ status: "active", selected_at: new Date().toISOString(), automation_status: "running" }).eq("id", id);

  const created: Array<{ platform: string; title: string; loops: number; fallback: boolean }> = [];

  for (const platform of platforms) {
    const memory = await getFeedbackMemoryContext({ brandId: campaign.brand_id, platform });
    let draft: PostDraft | null = null;
    let improvements: string[] = [];
    let loops = 0;
    let provider = "";
    let model: string | null = null;
    let fallback = false;

    // Content -> Crina review loop
    for (let round = 0; round <= MAX_CRINA_ROUNDS; round += 1) {
      const content = await runMarketingAgentModel({
        agentId: "agent-content-creator",
        fallbackAgentName: "Content Creator Agent",
        fallbackRole: "Copy and Editorial",
        task: `Create ${platform} post`,
        instructions: `Write ONE post tailored specifically to ${platform} (its format, length, tone). Use the brand voice and the campaign idea. Address the operator's past feedback. Do not publish.\n\nMemory:\n${memoryText(memory)}${improvements.length ? `\n\nCrina asked you to fix:\n- ${improvements.join("\n- ")}` : ""}`,
        outputSchema: contentSchema,
        input: { brand, campaign_idea: idea, platform, previous: draft },
        brainFiles: ["content-formulas.md", "approval-rules.md"],
        temperature: 0.5,
        routeOrigin: "api.marketing.campaigns.run"
      });
      provider = content.provider;
      model = content.modelUsed;
      draft = normalizePost(content.json, platform) ?? draft;
      loops = round + 1;
      if (!draft) { fallback = true; draft = { title: `${platform}: ${campaign.title}`, hook: String(idea.hook ?? ""), body: String(idea.summary ?? campaign.title), cta: String(idea.primary_cta ?? "Learn more"), hashtags: [] }; break; }

      // Crina reviews
      const review = await runMarketingAgentModel({
        agentId: "agent-crina",
        fallbackAgentName: "Crina",
        fallbackRole: "Marketing CEO Agent",
        task: "Review post",
        instructions: `Review this ${platform} post for brand fit, platform fit, hook strength, and the operator's past feedback. Approve if strong; otherwise return rework with specific improvements.\n\nMemory:\n${memoryText(memory)}`,
        outputSchema: reviewSchema,
        input: { brand, platform, post: draft, campaign_idea: idea },
        brainFiles: ["workflow-contract.md", "approval-rules.md"],
        temperature: 0.2,
        routeOrigin: "api.marketing.campaigns.run"
      });
      const decision = ((review.json as Record<string, unknown>)?.decision === "rework") ? "rework" : "approve";
      improvements = Array.isArray((review.json as Record<string, unknown>)?.improvements) ? ((review.json as Record<string, unknown>).improvements as unknown[]).map(String) : [];
      if (decision === "approve" || round === MAX_CRINA_ROUNDS) break;
    }

    const contentType = platform.toLowerCase().includes("blog") ? "Blog article" : platform.toLowerCase().includes("instagram") ? "Image post" : "Social post";
    const readyPackage = { platform, content_type: contentType, title: draft!.title, text: draft!.body, caption: draft!.body, hashtags: draft!.hashtags, alt_text: `Visual for ${draft!.title}`, scheduled_at: scheduledAt, crina_loops: loops, fallback_used: fallback };

    // Insert the post at the human gate (shows in Ready to Post).
    const { data: item, error: insErr } = await supabase
      .from("content_items")
      .insert({
        brand_id: campaign.brand_id,
        campaign_id: id,
        platform,
        content_type: contentType,
        title: draft!.title,
        hook: draft!.hook,
        body: draft!.body,
        CTA: draft!.cta,
        status: "approval",
        approval_status: "pending",
        workflow_stage: "human_final_approval",
        current_owner: "Human",
        next_owner: "Publishing Agent",
        assigned_agent: "Content Creator Agent",
        scheduled_at: scheduledAt,
        ready_package: readyPackage,
        performance_summary: `${fallback ? "FALLBACK " : ""}Crina-reviewed in ${loops} round(s). Provider ${provider}/${model ?? "default"}.`
      })
      .select("id")
      .single();

    if (insErr || !item) { created.push({ platform, title: draft!.title, loops, fallback: true }); continue; }

    // Visual: per-platform image (gpt-image-1), Crina-verified prompt comes from the idea + post.
    const imagePrompt = `Professional ${platform} visual for ${brand?.name ?? "the brand"}. Concept: ${draft!.title}. ${draft!.hook}. Clean, brand-safe, high detail, no text in the image.`;
    const image = await generateMarketingImage(imagePrompt, { contentItemId: item.id as string, position: 1, kind: "image" });
    await supabase.from("content_items").update({
      visual_asset_url: image.url,
      visual_asset_status: image.status,
      ready_package: { ...readyPackage, image_provider: image.provider }
    }).eq("id", item.id);

    await recordAgentRun({
      agentName: "Campaign Run", agentId: "agent-crina", workflowName: "Run Campaign (per-platform)", provider,
      status: fallback ? "fallback" : "success",
      input: { campaignId: id, platform, brand: brand?.name ?? null, routeOrigin: "api.marketing.campaigns.run" },
      output: { platform, crina_loops: loops, image_provider: image.provider, image_status: image.status },
      error: fallback ? "Fallback used." : null, model, durationMs: 0
    });

    created.push({ platform, title: draft!.title, loops, fallback });
  }

  // Ping the operator (Crina) that posts are ready to review.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const notifications = await sendCrinaReadyToPostPings({ campaignIds: [id], baseUrl });

  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing/ready-to-post");
  revalidatePath("/marketing/pipeline");
  return NextResponse.json({ campaign_id: id, posts_created: created.length, posts: created, notifications });
}
