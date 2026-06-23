import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { readLocalDashboardData, updateLocalContentItem } from "@/lib/local-store";
import { requireAgentAccess } from "@/lib/auth";
import { getFeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { acquireCampaignAutomationLock, releaseCampaignAutomationLock } from "@/lib/marketing/campaign-automation";
import { assetKindFor, desiredAssetCount, normalizeReadyPackage, readyPackageSchema, saveContentAssets } from "@/lib/marketing/ready-package";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem, ReadyPackageAsset } from "@/lib/types";

type StepResult = {
  itemId: string;
  title: string;
  step: string;
  status: "advanced" | "fallback" | "skipped" | "error";
  owner: string;
  error?: string | null;
};

type DraftOutput = {
  title: string;
  hook: string;
  body: string;
  CTA: string;
  editorNotes: string;
};

type ReviewOutput = {
  decision: "approve" | "rework";
  reason: string;
  improvements?: string[];
};

type VisualOutput = {
  visualConcept: string;
  assetPrompt: string;
  format: string;
  editorNotes: string;
};

const draftSchema = {
  title: "Improved content title.",
  hook: "Strong opening hook for the selected platform.",
  body: "Draft copy. Keep it useful, brand-safe, and platform-aware.",
  CTA: "One clear CTA.",
  editorNotes: "Short note explaining strategy and any claim/approval risk."
};

const reviewSchema = {
  decision: "approve | rework",
  reason: "Crina's review reason.",
  improvements: ["Specific improvements if decision is rework."]
};

const visualSchema = {
  visualConcept: "Operator-readable creative concept.",
  assetPrompt: "Prompt or production direction for image, carousel, or short video. No actual posting.",
  format: "image | carousel | short_video | text_only",
  editorNotes: "Short note explaining creative fit and risks."
};

const MAX_REWORK_ITERATIONS = 3;

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

function normalizeReview(value: unknown): ReviewOutput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const decision = raw.decision === "rework" ? "rework" : raw.decision === "approve" ? "approve" : null;
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const improvements = Array.isArray(raw.improvements) ? raw.improvements.map((item) => String(item)).filter(Boolean) : [];
  if (!decision || !reason) return null;
  return { decision, reason, improvements };
}

function normalizeVisual(value: unknown): VisualOutput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const visualConcept = typeof raw.visualConcept === "string" ? raw.visualConcept.trim() : "";
  const assetPrompt = typeof raw.assetPrompt === "string" ? raw.assetPrompt.trim() : "";
  const format = typeof raw.format === "string" ? raw.format.trim() : "image";
  const editorNotes = typeof raw.editorNotes === "string" ? raw.editorNotes.trim() : "";
  if (!visualConcept || !assetPrompt) return null;
  return { visualConcept, assetPrompt, format, editorNotes };
}

function deterministicDraft(item: ContentItem, brand: Brand | null, reason: string): DraftOutput {
  return {
    title: item.title,
    hook: item.hook || `A practical reason to pay attention to ${item.title}.`,
    body: `${item.body || item.title}\n\nFrame for ${brand?.target_audience ?? "the selected audience"}. Keep tone ${brand?.tone_of_voice ?? "professional"}. Add proof before final approval.\n\nFALLBACK reason: ${reason}`,
    CTA: item.CTA || brand?.ctas?.split(/[;\n,]/)[0]?.trim() || "Learn more",
    editorNotes: `FALLBACK: ${reason}`
  };
}

function deterministicReview(item: ContentItem, reason: string): ReviewOutput {
  return {
    decision: "approve",
    reason: `FALLBACK Crina review: draft is allowed to continue to the next internal stage, but final human approval remains required. ${reason}`,
    improvements: ["Verify claims before final approval."]
  };
}

function deterministicVisual(item: ContentItem, reason: string): VisualOutput {
  return {
    visualConcept: `Clean campaign visual for ${item.platform}: support the hook with one proof point, one brand cue, and one CTA.`,
    assetPrompt: `Create a professional ${item.platform} visual concept for: ${item.title}. Hook: ${item.hook}. Tone: serious, brand-safe, no exaggerated claims. Include space for CTA: ${item.CTA}.`,
    format: item.content_type.toLowerCase().includes("video") ? "short_video" : item.content_type.toLowerCase().includes("carousel") ? "carousel" : "image",
    editorNotes: `FALLBACK visual direction: ${reason}`
  };
}

function agentForItem(item: ContentItem) {
  const assigned = item.assigned_agent.toLowerCase();
  if (assigned.includes("seo")) return { id: "agent-seo", name: "SEO Agent", role: "Search Strategy" };
  if (assigned.includes("competitor")) return { id: "agent-competitor-intelligence", name: "Competitor Intelligence Agent", role: "Market Monitoring" };
  if (assigned.includes("visual")) return { id: "agent-visual-video", name: "Visual & Video Agent", role: "Creative Production" };
  return { id: "agent-content-creator", name: "Content Creator Agent", role: "Copy and Editorial" };
}

function isContentStage(item: ContentItem) {
  return item.status === "idea" || item.status === "brief" || item.workflow_stage === "content_creation";
}

function isCrinaDraftReviewStage(item: ContentItem) {
  return item.status === "draft" && (item.workflow_stage === "crina_content_review" || item.current_owner === "Crina");
}

function isVisualStage(item: ContentItem) {
  return item.status === "visual" || item.workflow_stage === "visual_creation";
}

function isCrinaFinalReviewStage(item: ContentItem) {
  return item.workflow_stage === "crina_final_review";
}

async function readContext(id: string) {
  if (!isSupabaseConfigured()) {
    const data = await readLocalDashboardData();
    const campaign = data.campaigns.find((item) => item.id === id) ?? null;
    const brand = campaign ? data.brands.find((item) => item.id === campaign.brand_id) ?? null : null;
    const items = data.contentItems.filter((item) => item.campaign_id === id);
    return { campaign, brand, items };
  }

  const supabase = await createClient();
  if (!supabase) return { campaign: null, brand: null, items: [] as ContentItem[] };

  const [{ data: campaign }, { data: brands }, { data: items }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase.from("brands").select("*"),
    supabase.from("content_items").select("*").eq("campaign_id", id)
  ]);

  const typedCampaign = (campaign as Campaign | null) ?? null;
  return {
    campaign: typedCampaign,
    brand: typedCampaign ? ((brands ?? []) as Brand[]).find((item) => item.id === typedCampaign.brand_id) ?? null : null,
    items: (items ?? []) as ContentItem[]
  };
}

async function saveItem(id: string, patch: Partial<ContentItem>) {
  if (!isSupabaseConfigured()) {
    return updateLocalContentItem(id, patch);
  }

  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("content_items").update(patch).eq("id", id).select("*").single();
  if (error) return null;
  return data as ContentItem;
}

async function memoryForItem(item: ContentItem) {
  return getFeedbackMemoryContext({
    brandId: item.brand_id,
    platform: item.platform,
    contentType: item.content_type
  });
}

async function runContentDraft(item: ContentItem, brand: Brand | null, campaign: Campaign): Promise<{ item: ContentItem | null; result: StepResult }> {
  const agent = agentForItem(item);
  const feedbackMemory = await memoryForItem(item);
  const run = await runMarketingAgentModel({
    agentId: agent.id,
    fallbackAgentName: agent.name,
    fallbackRole: agent.role,
    task: "Campaign Internal Draft",
    instructions:
      "Create a platform-specific draft from this campaign plan piece. Do not publish, schedule, or approve. Keep brand scope strict and flag claim risks.",
    outputSchema: draftSchema,
    input: { contentItem: item, brand, campaign, feedbackMemory },
    brainFiles: ["content-formulas.md", "approval-rules.md"],
    temperature: 0.35,
    routeOrigin: "api.marketing.campaigns.orchestrate"
  });
  const modelDraft = normalizeDraft(run.json);
  const fallback = !run.ok || !modelDraft;
  const draft = fallback ? deterministicDraft(item, brand, run.error ?? "Invalid draft JSON.") : modelDraft;
  const error = fallback ? run.error ?? `${run.provider} returned invalid draft JSON.` : null;

  const updated = await saveItem(item.id, {
    title: draft.title,
    hook: draft.hook,
    body: draft.body,
    CTA: draft.CTA,
    status: "draft",
    approval_status: "not_requested",
    assigned_agent: agent.name,
    workflow_stage: "crina_content_review",
    current_owner: "Crina",
    next_owner: "Visual & Video Agent",
    agent_handoff_summary: `${agent.name} created a draft and handed it to Crina for review.`,
    performance_summary: fallback
      ? `FALLBACK (${run.provider}/${run.modelUsed ?? "default"}): ${draft.editorNotes || error || "Deterministic draft generated."}`
      : `${run.provider}/${run.modelUsed ?? "default"} draft generated. ${draft.editorNotes}`
  });

  await recordAgentRun({
    agentName: agent.name,
    agentId: agent.id,
    workflowName: "Campaign Internal Draft",
    provider: run.provider,
    status: fallback ? "fallback" : "success",
    input: { contentItemId: item.id, campaignId: campaign.id, brand: brand?.name ?? null, feedbackMemory, routeOrigin: "api.marketing.campaigns.orchestrate" },
    output: { ...(draft as unknown as Record<string, unknown>), fallback_used: fallback, model: run.modelUsed },
    error,
    model: run.modelUsed,
    tokensPrompt: run.usage.tokensPrompt,
    tokensCompletion: run.usage.tokensCompletion,
    tokensTotal: run.usage.tokensTotal,
    durationMs: run.durationMs,
    brainResourcesUsed: run.brainResourcesUsed,
    handoffFrom: "Crina",
    handoffTo: agent.name,
    providerResponseStatus: run.status
  });

  return {
    item: updated,
    result: {
      itemId: item.id,
      title: draft.title,
      step: "Content draft",
      status: updated ? (fallback ? "fallback" : "advanced") : "error",
      owner: updated ? "Crina" : agent.name,
      error: updated ? error : error ?? "Draft was generated but could not be saved."
    }
  };
}

async function runCrinaDraftReview(item: ContentItem, brand: Brand | null, campaign: Campaign): Promise<{ item: ContentItem | null; result: StepResult }> {
  const feedbackMemory = await memoryForItem(item);
  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Review Campaign Draft",
    instructions:
      "Review this draft for brand fit, campaign fit, platform fit, clarity, and approval risk. Return approve to continue to visual creation, or rework if it must return to content. Do not ask the human yet.",
    outputSchema: reviewSchema,
    input: { contentItem: item, brand, campaign, feedbackMemory },
    brainFiles: ["workflow-contract.md", "approval-rules.md", "voice-calendar-memory.md"],
    temperature: 0.2,
    routeOrigin: "api.marketing.campaigns.orchestrate"
  });
  const modelReview = normalizeReview(run.json);
  const fallback = !run.ok || !modelReview;
  const review = fallback ? deterministicReview(item, run.error ?? "Invalid Crina review JSON.") : modelReview;
  const error = fallback ? run.error ?? `${run.provider} returned invalid review JSON.` : null;
  const approved = review.decision === "approve";
  const nextLoopIteration = approved ? item.loop_iteration ?? 0 : (item.loop_iteration ?? 0) + 1;
  const forceHumanReview = !approved && nextLoopIteration >= MAX_REWORK_ITERATIONS;

  const updated = await saveItem(item.id, {
    status: approved ? "visual" : forceHumanReview ? "approval" : "draft",
    approval_status: forceHumanReview ? "pending" : "not_requested",
    workflow_stage: approved ? "visual_creation" : forceHumanReview ? "human_final_approval" : "content_creation",
    current_owner: approved ? "Visual & Video Agent" : forceHumanReview ? "Human" : item.assigned_agent || "Content Creator Agent",
    next_owner: approved ? "Crina" : forceHumanReview ? "Crina" : "Crina",
    loop_iteration: nextLoopIteration,
    crina_review_notes: `${fallback ? "FALLBACK: " : ""}${forceHumanReview ? "Needs human review after repeated internal rework. " : ""}${review.reason}${review.improvements?.length ? ` Improvements: ${review.improvements.join("; ")}` : ""}`,
    performance_summary: `${item.performance_summary ?? ""}\nCrina draft review (${run.provider}/${run.modelUsed ?? "default"}): ${review.reason}`.trim()
  });

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Review Campaign Draft",
    provider: run.provider,
    status: fallback ? "fallback" : "success",
    input: { contentItemId: item.id, campaignId: campaign.id, brand: brand?.name ?? null, feedbackMemory, routeOrigin: "api.marketing.campaigns.orchestrate" },
    output: { ...(review as unknown as Record<string, unknown>), fallback_used: fallback, model: run.modelUsed },
    error,
    model: run.modelUsed,
    tokensPrompt: run.usage.tokensPrompt,
    tokensCompletion: run.usage.tokensCompletion,
    tokensTotal: run.usage.tokensTotal,
    durationMs: run.durationMs,
    brainResourcesUsed: run.brainResourcesUsed,
    handoffFrom: item.assigned_agent,
    handoffTo: approved ? "Visual & Video Agent" : item.assigned_agent,
    providerResponseStatus: run.status
  });

  return {
    item: updated,
    result: {
      itemId: item.id,
      title: item.title,
      step: "Crina draft review",
      status: updated ? (fallback ? "fallback" : "advanced") : "error",
      owner: forceHumanReview ? "Human" : approved ? "Visual & Video Agent" : item.assigned_agent,
      error: updated ? error : error ?? "Crina review completed but could not be saved."
    }
  };
}

async function runVisual(item: ContentItem, brand: Brand | null, campaign: Campaign): Promise<{ item: ContentItem | null; result: StepResult }> {
  const feedbackMemory = await memoryForItem(item);
  const run = await runMarketingAgentModel({
    agentId: "agent-visual-video",
    fallbackAgentName: "Visual & Video Agent",
    fallbackRole: "Creative Production",
    task: "Create Campaign Visual Direction",
    instructions:
      "Create visual, carousel, or short-video production direction for this draft. Do not generate a live post or publish. Return a useful prompt/direction for later asset generation.",
    outputSchema: visualSchema,
    input: { contentItem: item, brand, campaign, feedbackMemory },
    brainFiles: ["visual-video-soul.md", "approval-rules.md"],
    temperature: 0.35,
    routeOrigin: "api.marketing.campaigns.orchestrate"
  });
  const modelVisual = normalizeVisual(run.json);
  const fallback = !run.ok || !modelVisual;
  const visual = fallback ? deterministicVisual(item, run.error ?? "Invalid visual JSON.") : modelVisual;
  const error = fallback ? run.error ?? `${run.provider} returned invalid visual JSON.` : null;

  const assetCount = desiredAssetCount(item);
  const assetKind = assetKindFor(item);
  const generatedAssets: ReadyPackageAsset[] = [];
  for (let index = 0; index < assetCount; index += 1) {
    const prompt = assetCount > 1 ? `${visual.assetPrompt}\nCarousel slide ${index + 1} of ${assetCount}. Keep visual continuity and no unverified claims.` : visual.assetPrompt;
    const image = await generateMarketingImage(prompt, { contentItemId: item.id, position: index + 1, kind: assetKind });
    generatedAssets.push({
      kind: assetKind,
      url: image.url,
      prompt,
      position: index + 1,
      model: image.model,
      provider: image.provider,
      status: image.status,
      error: image.error
    });
  }
  await saveContentAssets(item.id, generatedAssets);
  const firstAsset = generatedAssets[0];
  const assetFailed = generatedAssets.every((asset) => asset.status !== "generated");

  const updated = await saveItem(item.id, {
    status: "visual",
    approval_status: "not_requested",
    workflow_stage: "crina_final_review",
    current_owner: "Crina",
    next_owner: "Human",
    visual_asset_url: firstAsset?.url ?? null,
    visual_asset_status: fallback || assetFailed ? "placeholder" : "generated",
    visual_asset_prompt: `${visual.format}: ${visual.assetPrompt}`,
    visual_asset_model: firstAsset?.model ?? run.modelUsed,
    visual_asset_error: assetFailed ? firstAsset?.error ?? error : error,
    agent_handoff_summary: `Visual & Video Agent prepared creative direction and handed it to Crina for final package review.`,
    performance_summary: `${item.performance_summary ?? ""}\nVisual direction (${run.provider}/${run.modelUsed ?? "default"}): ${visual.visualConcept}. ${visual.editorNotes}`.trim()
  });

  await recordAgentRun({
    agentName: "Visual & Video Agent",
    agentId: "agent-visual-video",
    workflowName: "Create Campaign Visual Direction",
    provider: run.provider,
    status: fallback ? "fallback" : "success",
    input: { contentItemId: item.id, campaignId: campaign.id, brand: brand?.name ?? null, feedbackMemory, routeOrigin: "api.marketing.campaigns.orchestrate" },
    output: { ...(visual as unknown as Record<string, unknown>), fallback_used: fallback, model: run.modelUsed },
    error,
    model: run.modelUsed,
    tokensPrompt: run.usage.tokensPrompt,
    tokensCompletion: run.usage.tokensCompletion,
    tokensTotal: run.usage.tokensTotal,
    durationMs: run.durationMs,
    brainResourcesUsed: run.brainResourcesUsed,
    handoffFrom: "Crina",
    handoffTo: "Crina",
    providerResponseStatus: run.status
  });

  return {
    item: updated,
    result: {
      itemId: item.id,
      title: item.title,
      step: "Visual direction",
      status: updated ? (fallback ? "fallback" : "advanced") : "error",
      owner: updated ? "Crina" : "Visual & Video Agent",
      error: updated ? error : error ?? "Visual direction was generated but could not be saved."
    }
  };
}

async function runCrinaFinalReview(item: ContentItem, brand: Brand | null, campaign: Campaign): Promise<{ item: ContentItem | null; result: StepResult }> {
  const feedbackMemory = await memoryForItem(item);
  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Assemble Final Campaign Package",
    instructions:
      "Review the draft and visual direction as a final package. If it is coherent, mark it ready for human final approval. If not, request rework. Never approve on behalf of the human.",
    outputSchema: reviewSchema,
    input: { contentItem: item, brand, campaign, feedbackMemory },
    brainFiles: ["workflow-contract.md", "approval-rules.md", "voice-calendar-memory.md"],
    temperature: 0.2,
    routeOrigin: "api.marketing.campaigns.orchestrate"
  });
  const modelReview = normalizeReview(run.json);
  const fallback = !run.ok || !modelReview;
  const review = fallback ? deterministicReview(item, run.error ?? "Invalid Crina final review JSON.") : modelReview;
  const error = fallback ? run.error ?? `${run.provider} returned invalid final review JSON.` : null;
  const ready = review.decision === "approve";
  const nextLoopIteration = ready ? item.loop_iteration ?? 0 : (item.loop_iteration ?? 0) + 1;
  const forceHumanReview = !ready && nextLoopIteration >= MAX_REWORK_ITERATIONS;

  let readyPackage = item.ready_package ?? null;
  let packageFallback = false;
  let packageError: string | null = null;

  if (ready || forceHumanReview) {
    const packagingRun = await runMarketingAgentModel({
      agentId: "agent-publishing",
      fallbackAgentName: "Publishing Agent",
      fallbackRole: "Draft Packaging",
      task: "Package Campaign Item Ready To Post",
      instructions:
        "Create a platform-ready draft package for manual posting/export only. Do not publish, schedule, connect accounts, or approve. X text must be 280 characters or less. Instagram video must include script and storyboard only; real video generation is COMING SOON.",
      outputSchema: readyPackageSchema,
      input: { contentItem: item, brand, campaign, feedbackMemory, visualAssetUrl: item.visual_asset_url, visualAssetPrompt: item.visual_asset_prompt },
      brainFiles: ["draft-publishing-safety.md", "workflow-contract.md", "approval-rules.md"],
      temperature: 0.25,
      routeOrigin: "api.marketing.campaigns.orchestrate.ready_package"
    });
    packageFallback = !packagingRun.ok || !packagingRun.json;
    packageError = packageFallback ? packagingRun.error ?? "Publishing Agent returned invalid package JSON." : null;
    readyPackage = {
      ...normalizeReadyPackage(packageFallback ? null : packagingRun.json, item, packageFallback),
      provider: packagingRun.provider,
      model: packagingRun.modelUsed,
      fallback_used: packageFallback
    };

    await recordAgentRun({
      agentName: "Publishing Agent",
      agentId: "agent-publishing",
      workflowName: "Package Campaign Item Ready To Post",
      provider: packagingRun.provider,
      status: packageFallback ? "fallback" : "success",
      input: { contentItemId: item.id, campaignId: campaign.id, brand: brand?.name ?? null, feedbackMemory, routeOrigin: "api.marketing.campaigns.orchestrate.ready_package" },
      output: { ready_package: readyPackage, fallback_used: packageFallback, model: packagingRun.modelUsed },
      error: packageError,
      model: packagingRun.modelUsed,
      tokensPrompt: packagingRun.usage.tokensPrompt,
      tokensCompletion: packagingRun.usage.tokensCompletion,
      tokensTotal: packagingRun.usage.tokensTotal,
      durationMs: packagingRun.durationMs,
      brainResourcesUsed: packagingRun.brainResourcesUsed,
      handoffFrom: "Crina",
      handoffTo: "Human",
      providerResponseStatus: packagingRun.status
    });
  }

  const updated = await saveItem(item.id, {
    status: ready || forceHumanReview ? "approval" : "draft",
    approval_status: ready || forceHumanReview ? "pending" : "changes_requested",
    workflow_stage: ready || forceHumanReview ? "human_final_approval" : "content_creation",
    current_owner: ready || forceHumanReview ? "Human" : item.assigned_agent || "Content Creator Agent",
    next_owner: ready || forceHumanReview ? "Publishing Agent" : "Crina",
    loop_iteration: nextLoopIteration,
    ready_package: readyPackage,
    crina_review_notes: `${fallback ? "FALLBACK: " : ""}${forceHumanReview ? "Needs human review after repeated internal rework. " : ""}${review.reason}${review.improvements?.length ? ` Improvements: ${review.improvements.join("; ")}` : ""}`,
    performance_summary: `${item.performance_summary ?? ""}\nCrina final review (${run.provider}/${run.modelUsed ?? "default"}): ${review.reason}${packageFallback ? `\nFALLBACK ready package: ${packageError}` : ""}`.trim()
  });

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Assemble Final Campaign Package",
    provider: run.provider,
    status: fallback ? "fallback" : "success",
    input: { contentItemId: item.id, campaignId: campaign.id, brand: brand?.name ?? null, feedbackMemory, routeOrigin: "api.marketing.campaigns.orchestrate" },
    output: { ...(review as unknown as Record<string, unknown>), fallback_used: fallback, model: run.modelUsed },
    error,
    model: run.modelUsed,
    tokensPrompt: run.usage.tokensPrompt,
    tokensCompletion: run.usage.tokensCompletion,
    tokensTotal: run.usage.tokensTotal,
    durationMs: run.durationMs,
    brainResourcesUsed: run.brainResourcesUsed,
    handoffFrom: "Visual & Video Agent",
    handoffTo: ready ? "Human" : item.assigned_agent,
    providerResponseStatus: run.status
  });

  return {
    item: updated,
    result: {
      itemId: item.id,
      title: item.title,
      step: "Crina final review",
      status: updated ? (fallback ? "fallback" : "advanced") : "error",
      owner: ready || forceHumanReview ? "Human" : item.assigned_agent,
      error: updated ? error : error ?? "Crina final review completed but could not be saved."
    }
  };
}

async function processItem(item: ContentItem, brand: Brand | null, campaign: Campaign) {
  if (isContentStage(item)) return runContentDraft(item, brand, campaign);
  if (isCrinaDraftReviewStage(item)) return runCrinaDraftReview(item, brand, campaign);
  if (isVisualStage(item)) return runVisual(item, brand, campaign);
  if (isCrinaFinalReviewStage(item)) return runCrinaFinalReview(item, brand, campaign);

  return {
    item,
    result: {
      itemId: item.id,
      title: item.title,
      step: "No eligible internal step",
      status: "skipped" as const,
      owner: item.current_owner || item.assigned_agent || "Crina"
    }
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAgentAccess(request);
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const lock = await acquireCampaignAutomationLock(id);
  if (!lock.ok) {
    const reason = "reason" in lock ? lock.reason : "error" in lock ? lock.error : "already running";
    return NextResponse.json({ skipped: true, reason }, { status: lock.status });
  }

  try {
  const { campaign, brand, items } = await readContext(id);

  if (!campaign) {
    await releaseCampaignAutomationLock(id, "needs_attention", { error: "Campaign not found." });
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status !== "active") {
    await releaseCampaignAutomationLock(id, "idle", { error: "Campaign must be approved before orchestration can continue." });
    return NextResponse.json({ error: "Campaign must be approved before orchestration can continue." }, { status: 409 });
  }
  if (!items.length) {
    await releaseCampaignAutomationLock(id, "idle", { error: "No Crina campaign plan exists yet. Start Crina plan first." });
    return NextResponse.json({ error: "No Crina campaign plan exists yet. Start Crina plan first." }, { status: 409 });
  }

  let currentItems = items;
  const eligible = currentItems.filter(
    (item) =>
      isContentStage(item) ||
      isCrinaDraftReviewStage(item) ||
      isVisualStage(item) ||
      isCrinaFinalReviewStage(item)
  );

  if (!eligible.length) {
    const waitingForHuman = currentItems.some((item) => item.workflow_stage === "human_final_approval" || item.approval_status === "pending");
    const publishingPrep = currentItems.some((item) => item.workflow_stage === "publishing_prep" || item.status === "scheduled");
    await releaseCampaignAutomationLock(id, waitingForHuman ? "waiting_human" : publishingPrep ? "publishing_prep" : "idle");
    return NextResponse.json({
      campaign,
      results: [],
      message: "No internal agent step is eligible right now. The campaign may be waiting for human approval or publishing prep."
    });
  }

  const results: StepResult[] = [];
  const updatedItems: ContentItem[] = [];
  const maxRounds = 2;
  const maxSteps = 3;

  for (let round = 0; round < maxRounds && results.length < maxSteps; round += 1) {
    const roundEligible = currentItems.filter(
      (item) =>
        isContentStage(item) ||
        isCrinaDraftReviewStage(item) ||
        isVisualStage(item) ||
        isCrinaFinalReviewStage(item)
    );

    if (!roundEligible.length) break;

    for (const item of roundEligible.slice(0, maxSteps - results.length)) {
      try {
        const processed = await processItem(item, brand, campaign);
        results.push(processed.result);
        if (processed.item) {
          updatedItems.push(processed.item);
          currentItems = currentItems.map((candidate) => (candidate.id === processed.item!.id ? processed.item! : candidate));
        }
      } catch (error) {
        results.push({
          itemId: item.id,
          title: item.title,
          step: "Internal orchestration",
          status: "error",
          owner: item.current_owner || item.assigned_agent || "Crina",
          error: error instanceof Error ? error.message : "Unknown orchestration error."
        });
      }
    }
  }

  revalidatePath("/marketing/pipeline");
  revalidatePath("/marketing/approvals");
  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing");

  const waitingForHuman = currentItems.some((item) => item.workflow_stage === "human_final_approval" || item.approval_status === "pending");
  const publishingPrep = currentItems.some((item) => item.workflow_stage === "publishing_prep" || item.status === "scheduled");
  const stepLimitReached = results.length >= maxSteps;
  const advanced = results.filter((result) => result.status === "advanced" || result.status === "fallback").length;
  const hasError = results.some((result) => result.status === "error");
  const nextNoProgressCount = advanced ? 0 : (campaign.automation_no_progress_count ?? 0) + 1;
  const automationStatus = waitingForHuman
    ? "waiting_human"
    : publishingPrep
      ? "publishing_prep"
      : hasError && !advanced
        ? "needs_attention"
        : nextNoProgressCount >= 3
          ? "needs_attention"
          : "running";

  await releaseCampaignAutomationLock(id, automationStatus, {
    error: hasError ? results.find((result) => result.status === "error")?.error ?? "Internal automation error." : null,
    noProgressCount: nextNoProgressCount
  });

  return NextResponse.json({
    campaign,
    contentItems: updatedItems,
    results,
    message: waitingForHuman
      ? "Internal agent workflow reached the human final approval gate."
      : stepLimitReached
        ? "Internal automation completed a safe batch. More internal work may remain."
        : "Internal agent workflow advanced as far as it can right now."
  });
  } catch (error) {
    await releaseCampaignAutomationLock(id, "needs_attention", { error: error instanceof Error ? error.message : "Internal campaign automation failed." });
    throw error;
  }
}
