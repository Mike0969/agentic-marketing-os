import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAgentAccess } from "@/lib/auth";
import { sendCrinaReadyToPostPings } from "@/lib/marketing/crina-telegram";
import { runConversionAnalysis } from "@/lib/marketing/conversion-agent";
import { conversionMemoryText, getConversionMemoryContext } from "@/lib/marketing/conversion-memory";
import { getFeedbackMemoryContext, type FeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { runJudgedLoop, type JudgeResult, type LoopReceipt } from "@/lib/marketing/loop-runner";
import { CONTENT_RUBRIC, VISUAL_RUBRIC } from "@/lib/marketing/rubrics";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign } from "@/lib/types";

const VISUAL_MAX_ROUNDS = 2; // visual concept converges fast; keep the per-platform call budget bounded
const MAX_PLATFORMS = 4; // bound per request to stay under serverless timeouts

type PostDraft = { title: string; hook: string; body: string; cta: string; hashtags: string[] };
type VisualConcept = { concept: string; prompt: string };

const contentSchema = { title: "string", hook: "string", body: "platform-tailored post text", cta: "string", hashtags: ["#tag"] };
const visualSchema = { concept: "one-line visual concept that matches the post", prompt: "image-generation prompt; brand-safe; no text in the image" };
const judgeSchema = {
  score: 0,
  dimension_scores: { brand_fit: 0, audience_fit: 0, platform_fit: 0, clarity: 0, proof: 0, cta: 0, non_generic: 0, safety: 0 },
  safety_pass: true,
  judge_notes: "string",
  improvements: ["specific, concrete fix for the maker"]
};

function memoryText(m: FeedbackMemoryContext) {
  const a = m.approved.map((x) => `+ ${x.summary}${x.reason ? ` (${x.reason})` : ""}`).join("\n") || "+ none yet";
  const r = m.rejected.map((x) => `- ${x.summary}${x.reason ? ` (${x.reason})` : ""}`).join("\n") || "- none yet";
  return `Human-approved before:\n${a}\nHuman-rejected before (avoid these):\n${r}`;
}

function clampScore(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
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

  await supabase.from("campaigns").update({ status: "active", selected_at: new Date().toISOString(), automation_status: "running" }).eq("id", id);

  // One receipt writer for the whole run; content_item_id is backfilled after each item is created.
  const recordReceipt = async (r: LoopReceipt) => {
    await supabase.from("loop_receipts").insert({
      loop_id: r.loopId,
      loop_type: r.loopType,
      brand_id: campaign.brand_id,
      campaign_id: id,
      content_item_id: null,
      agent_id: r.agentId,
      round_number: r.roundNumber,
      input_summary: r.inputSummary,
      output_summary: r.outputSummary,
      score_before: r.scoreBefore,
      score_after: r.scoreAfter,
      judge_notes: r.judgeNotes,
      decision: r.decision,
      stop_reason: r.stopReason,
      fallback_used: r.fallbackUsed,
      provider: r.provider,
      model: r.model,
      tokens_prompt: r.tokensPrompt,
      tokens_completion: r.tokensCompletion,
      tokens_total: r.tokensTotal,
      latency_ms: r.latencyMs
    });
  };

  const created: Array<{ platform: string; title: string; loops: number; score: number; stop: string; blocked?: boolean; fallback: boolean }> = [];

  for (const platform of platforms) {
    const memory = await getFeedbackMemoryContext({ brandId: campaign.brand_id, platform });
    const conversion = await getConversionMemoryContext({ brandId: campaign.brand_id, platform });

    // Crina judges a candidate against a rubric -> a numeric, bounded acceptance check.
    const judgeWith = async (rubric: string, artifactLabel: string, artifact: unknown): Promise<JudgeResult> => {
      const review = await runMarketingAgentModel({
        agentId: "agent-crina",
        fallbackAgentName: "Crina",
        fallbackRole: "Marketing CEO Agent",
        task: `Judge ${artifactLabel}`,
        instructions: `${rubric}\n\nYou are Crina, the CEO, scoring a specialist's ${artifactLabel} for ${platform}. Weigh the operator's past feedback and what converts. Return the rubric score (0-100), per-dimension scores, safety_pass (false on ANY safety/compliance issue), concise judge_notes, and specific improvements the maker can apply next round.\n\nMemory:\n${memoryText(memory)}\n\nWhat converts:\n${conversionMemoryText(conversion)}`,
        outputSchema: judgeSchema,
        input: { brand, platform, [artifactLabel]: artifact, campaign_idea: idea, conversion_insights: conversion.insights },
        brainFiles: ["workflow-contract.md", "approval-rules.md"],
        temperature: 0.2,
        routeOrigin: "api.marketing.campaigns.run"
      });
      const j = (review.json ?? {}) as Record<string, unknown>;
      return {
        score: clampScore(j.score),
        safetyPass: !(j.safety_pass === false),
        judgeNotes: typeof j.judge_notes === "string" ? j.judge_notes : "",
        improvements: Array.isArray(j.improvements) ? j.improvements.map(String) : [],
        tokensTotal: review.usage.tokensTotal,
        latencyMs: review.durationMs
      };
    };

    // 1) Content loop — Content Creator makes, Crina scores, keep champion.
    const contentLoop = await runJudgedLoop<PostDraft>({
      loopType: "content",
      agentId: "agent-content-creator",
      inputSummary: `${platform} post for "${campaign.title}"`,
      recordReceipt,
      make: async (_round, improvements, champion) => {
        const content = await runMarketingAgentModel({
          agentId: "agent-content-creator",
          fallbackAgentName: "Content Creator Agent",
          fallbackRole: "Copy and Editorial",
          task: `Create ${platform} post`,
          instructions: `Write ONE post tailored specifically to ${platform} (its format, length, tone). Use the brand voice and the campaign idea. Address the operator's past feedback and what converts. Do not publish.\n\nMemory:\n${memoryText(memory)}\n\nWhat converts (bias toward these):\n${conversionMemoryText(conversion)}${improvements.length ? `\n\nCrina asked you to fix:\n- ${improvements.join("\n- ")}` : ""}`,
          outputSchema: contentSchema,
          input: { brand, campaign_idea: idea, platform, previous: champion, conversion_insights: conversion.insights },
          brainFiles: ["content-formulas.md", "approval-rules.md"],
          temperature: 0.5,
          routeOrigin: "api.marketing.campaigns.run"
        });
        const draft = normalizePost(content.json, platform);
        return {
          candidate: draft,
          outputSummary: draft ? `${draft.title} — ${draft.hook}`.slice(0, 180) : "no draft produced",
          provider: content.provider,
          model: content.modelUsed,
          fallbackUsed: !draft,
          tokensPrompt: content.usage.tokensPrompt,
          tokensCompletion: content.usage.tokensCompletion,
          tokensTotal: content.usage.tokensTotal,
          latencyMs: content.durationMs
        };
      },
      judge: async (candidate) => judgeWith(CONTENT_RUBRIC, "post", candidate)
    });

    // Safety-blocked content => no postable package for this platform.
    if (!contentLoop.champion && contentLoop.stopReason === "safety") {
      created.push({ platform, title: `${platform} (safety-blocked)`, loops: contentLoop.rounds, score: 0, stop: "safety", blocked: true, fallback: true });
      continue;
    }

    let fallback = contentLoop.fallbackUsed || !contentLoop.champion;
    const draft: PostDraft = contentLoop.champion ?? {
      title: `${platform}: ${campaign.title}`,
      hook: String(idea.hook ?? ""),
      body: String(idea.summary ?? campaign.title),
      cta: String(idea.primary_cta ?? "Learn more"),
      hashtags: []
    };

    const contentType = platform.toLowerCase().includes("blog") ? "Blog article" : platform.toLowerCase().includes("instagram") ? "Image post" : "Social post";
    const reviewChip = `${contentLoop.championScore}/100 · ${contentLoop.rounds} round(s) · ${contentLoop.stopReason}`;
    const readyPackage = { platform, content_type: contentType, title: draft.title, text: draft.body, caption: draft.body, hashtags: draft.hashtags, alt_text: `Visual for ${draft.title}`, scheduled_at: scheduledAt, crina_score: contentLoop.championScore, crina_loops: contentLoop.rounds, fallback_used: fallback };

    const { data: item, error: insErr } = await supabase
      .from("content_items")
      .insert({
        brand_id: campaign.brand_id,
        campaign_id: id,
        platform,
        content_type: contentType,
        title: draft.title,
        hook: draft.hook,
        body: draft.body,
        CTA: draft.cta,
        status: "approval",
        approval_status: "pending",
        workflow_stage: "human_final_approval",
        current_owner: "Human",
        next_owner: "Publishing Agent",
        assigned_agent: "Content Creator Agent",
        scheduled_at: scheduledAt,
        loop_iteration: contentLoop.rounds,
        crina_review_notes: reviewChip,
        ready_package: readyPackage,
        performance_summary: `${fallback ? "FALLBACK " : ""}Crina ${reviewChip}. Provider ${contentLoop.provider}/${contentLoop.model ?? "default"}.`
      })
      .select("id")
      .single();

    if (insErr || !item) {
      created.push({ platform, title: draft.title, loops: contentLoop.rounds, score: contentLoop.championScore, stop: contentLoop.stopReason, fallback: true });
      continue;
    }

    // 2) Visual loop — Visual Agent proposes concept+prompt, Crina scores fit, keep champion.
    const visualLoop = await runJudgedLoop<VisualConcept>({
      loopType: "visual",
      agentId: "agent-visual-video",
      inputSummary: `Visual for "${draft.title}" (${platform})`,
      maxRounds: VISUAL_MAX_ROUNDS,
      recordReceipt,
      make: async (_round, improvements, champion) => {
        const v = await runMarketingAgentModel({
          agentId: "agent-visual-video",
          fallbackAgentName: "Visual & Video Agent",
          fallbackRole: "Visual Concepts",
          task: `Concept a ${platform} visual`,
          instructions: `Propose ONE visual concept + an image-generation prompt for this approved ${platform} post. Match the brand and the post's message. Brand-safe; no text in the image; no real-person likeness; no unapproved logos.${improvements.length ? `\n\nCrina asked you to fix:\n- ${improvements.join("\n- ")}` : ""}`,
          outputSchema: visualSchema,
          input: { brand, platform, post: draft, previous: champion },
          brainFiles: ["content-formulas.md", "approval-rules.md"],
          temperature: 0.5,
          routeOrigin: "api.marketing.campaigns.run"
        });
        const vj = (v.json ?? {}) as Record<string, unknown>;
        const concept = typeof vj.concept === "string" ? vj.concept.trim() : "";
        const prompt = typeof vj.prompt === "string" ? vj.prompt.trim() : typeof vj.image_prompt === "string" ? (vj.image_prompt as string).trim() : "";
        const candidate = prompt ? { concept, prompt } : null;
        return {
          candidate,
          outputSummary: (concept || prompt).slice(0, 180) || "no concept produced",
          provider: v.provider,
          model: v.modelUsed,
          fallbackUsed: !candidate,
          tokensPrompt: v.usage.tokensPrompt,
          tokensCompletion: v.usage.tokensCompletion,
          tokensTotal: v.usage.tokensTotal,
          latencyMs: v.durationMs
        };
      },
      judge: async (candidate) => judgeWith(VISUAL_RUBRIC, "visual", candidate)
    });

    // Generate one image from the champion prompt (safety-blocked or empty -> safe generic prompt).
    const imagePrompt =
      visualLoop.champion && visualLoop.stopReason !== "safety"
        ? visualLoop.champion.prompt
        : `Professional ${platform} visual for ${brand?.name ?? "the brand"}. Concept: ${draft.title}. ${draft.hook}. Clean, brand-safe, high detail, no text in the image.`;
    const image = await generateMarketingImage(imagePrompt, { contentItemId: item.id as string, position: 1, kind: "image" });
    await supabase
      .from("content_items")
      .update({
        visual_asset_url: image.url,
        visual_asset_prompt: imagePrompt,
        visual_asset_status: image.status,
        ready_package: { ...readyPackage, image_provider: image.provider, visual_score: visualLoop.championScore },
        performance_summary: `${fallback ? "FALLBACK " : ""}Crina ${reviewChip}. Visual ${visualLoop.championScore}/100 (${visualLoop.stopReason}). Provider ${contentLoop.provider}/${contentLoop.model ?? "default"}.`
      })
      .eq("id", item.id);

    // Link this item's receipts (written with null content_item_id during the loops).
    await supabase.from("loop_receipts").update({ content_item_id: item.id }).in("loop_id", [contentLoop.loopId, visualLoop.loopId]);

    await recordAgentRun({
      agentName: "Campaign Run",
      agentId: "agent-crina",
      workflowName: "Run Campaign (per-platform)",
      provider: contentLoop.provider,
      status: fallback ? "fallback" : "success",
      input: { campaignId: id, platform, brand: brand?.name ?? null, routeOrigin: "api.marketing.campaigns.run" },
      output: { platform, content_score: contentLoop.championScore, content_stop: contentLoop.stopReason, content_rounds: contentLoop.rounds, visual_score: visualLoop.championScore, visual_stop: visualLoop.stopReason, image_provider: image.provider, image_status: image.status },
      error: fallback ? "Fallback used." : null,
      model: contentLoop.model,
      durationMs: 0
    });

    created.push({ platform, title: draft.title, loops: contentLoop.rounds, score: contentLoop.championScore, stop: contentLoop.stopReason, fallback });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const notifications = await sendCrinaReadyToPostPings({ campaignIds: [id], baseUrl });

  // Close the loop: refresh conversion estimates + insights for the next run (best-effort).
  try {
    await runConversionAnalysis({ brandId: campaign.brand_id, campaignId: id });
  } catch {
    // never break the run on conversion-analysis failure
  }

  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing/ready-to-post");
  revalidatePath("/marketing/pipeline");
  return NextResponse.json({ campaign_id: id, posts_created: created.length, posts: created, notifications });
}
