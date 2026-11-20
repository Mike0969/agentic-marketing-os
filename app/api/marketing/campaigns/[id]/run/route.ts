import { NextResponse } from "next/server";
import { JOB_STALE_MS, getJob, runOutcome, startCampaignJob } from "@/lib/marketing/campaign-jobs";
import { brandGaps, safetyBlockReason } from "@/lib/marketing/brand-placeholders";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAgentAccess } from "@/lib/auth";
import { sendCrinaReadyToPostPings } from "@/lib/marketing/crina-telegram";
import { notifyOperator } from "@/lib/marketing/notify";
import { runConversionAnalysis } from "@/lib/marketing/conversion-agent";
import { defaultRegion, pickScheduledAt } from "@/lib/marketing/auto-schedule";
import { conversionMemoryText, getConversionMemoryContext } from "@/lib/marketing/conversion-memory";
import { getFeedbackMemoryContext, type FeedbackMemoryContext } from "@/lib/marketing/feedback-memory";
import { runJudgedLoop, type JudgeResult, type LoopReceipt, type LoopResult } from "@/lib/marketing/loop-runner";
import { composeCarouselSlide } from "@/lib/marketing/carousel-composer";
import { getPlatformPlan, type NativeDraft } from "@/lib/marketing/platform-generation";
import { createProjectAsset, findAssetCandidates, recordAssetUsage, resolveProjectSlug } from "@/lib/marketing/project-assets";
import { saveContentAssets } from "@/lib/marketing/ready-package";
import { CONTENT_RUBRIC, HONEST_GRADER_PREAMBLE, VISUAL_RUBRIC } from "@/lib/marketing/rubrics";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import { jevQuestions } from "@/lib/jev/jev";
import { getBudgetStatus, limitMessage, preflight, withCampaignBudget, STEP_AGENTS, times, usd, estimateUsd, CONTENT_ROUNDS } from "@/lib/budget/model-budget";
import { libraryContext } from "@/lib/learning/library";
import { defaultVault, learningContext } from "@/lib/learning/vault";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ProjectAsset, ReadyPackageAsset } from "@/lib/types";

const VISUAL_MAX_ROUNDS = 2; // visual concept converges fast; keep the per-platform call budget bounded
const MAX_PLATFORMS = 4; // bound per request to stay under serverless timeouts

type VisualConcept = { concept: string; prompt: string };

const visualSchema = { concept: "one-line visual concept that matches the post", prompt: "image-generation prompt; brand-safe; no text in the image" };
const judgeSchema = {
  score: 0,
  dimension_scores: { brand_fit: 0, audience_fit: 0, platform_fit: 0, clarity: 0, proof: 0, cta: 0, non_generic: 0, safety: 0 },
  safety_pass: true,
  flagged_sentences: ["string"],
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Every model call in this run is charged to the campaign's budget.
  const { id } = await context.params;
  // { background: true } (the Review buttons): record a job, answer at once, run on the server
  // (closing the tab never stops it), then alert Mihai with the result and a link.
  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (body.background === true) {
    const access = await requireAgentAccess(request);
    if (!access.ok) return access.response;
    const running = await getJob(id);
    if (running?.state === "running" && Date.now() - Date.parse(running.started_at) < JOB_STALE_MS) {
      return NextResponse.json({ error: "The agents are already working on this campaign. You'll be notified when it's ready." }, { status: 409 });
    }
    const label = body.approvedDraft ? "Edit and approve" : typeof body.note === "string" && body.note.trim() ? "Rework with your note" : "Run the agents";
    const token = process.env.AGENT_TRIGGER_TOKEN ?? "";
    const inner = { ...body, background: false };
    const job = await startCampaignJob({
      campaignId: id,
      kind: "run",
      label,
      origin: request.url,
      work: async () => {
        const res = await withCampaignBudget(id, () =>
          runCampaign(new Request(request.url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(inner) }), context)
        );
        return runOutcome(res.status, (await res.json().catch(() => ({}))) as Parameters<typeof runOutcome>[1]);
      }
    });
    return NextResponse.json({ background: true, job }, { status: 202 });
  }
  const replay = new Request(request.url, { method: "POST", headers: request.headers, body: raw || undefined });
  return withCampaignBudget(id, () => runCampaign(replay, context));
}

async function runCampaign(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  // Optional { platform }: add-ONE-platform mode (generate a single native variant without
  // regenerating the others). No body = full-campaign run.
  // { note }: "Rework with my note" (Mihai's instruction, followed by the makers and the judge).
  // { approvedDraft }: "Edit and approve": Mihai's edited text for ONE platform, used as the post (no text
  // loop, no text safety check: he approved it); the visual and his normal Review still follow.
  let requestedPlatform: string | null = null;
  let ownerNote = "";
  let approvedDraft: NativeDraft | null = null;
  try {
    const body = (await request.json()) as { platform?: unknown; note?: unknown; approvedDraft?: unknown };
    if (typeof body?.platform === "string" && body.platform.trim()) requestedPlatform = body.platform.trim();
    if (typeof body?.note === "string") ownerNote = body.note.trim().slice(0, 1000);
    const d = body?.approvedDraft as Record<string, unknown> | undefined;
    if (d && typeof d === "object" && typeof d.body === "string" && d.body.trim() && requestedPlatform) {
      approvedDraft = {
        title: String(d.title ?? "").trim().slice(0, 200) || requestedPlatform,
        hook: String(d.hook ?? "").trim().slice(0, 500),
        body: d.body.trim().slice(0, 5000),
        cta: String(d.cta ?? "").trim().slice(0, 300),
        hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String).map((h) => h.trim()).filter(Boolean).slice(0, 30) : [],
        ...(Array.isArray(d.slides)
          ? { slides: (d.slides as Array<Record<string, unknown>>).slice(0, 10).map((sl) => ({ headline: String(sl?.headline ?? "").slice(0, 200), text: String(sl?.text ?? "").slice(0, 1000) })).filter((sl) => sl.headline || sl.text) }
          : {}),
        ...(typeof d.script === "string" && d.script.trim() ? { script: d.script.trim().slice(0, 5000) } : {}),
        ...(Array.isArray(d.storyboard) ? { storyboard: d.storyboard.map(String).slice(0, 20) } : {})
      };
    }
  } catch {
    // no JSON body -> full run
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: campaignRow } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  const campaign = campaignRow as Campaign | null;
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", campaign.brand_id).maybeSingle();
  const brand = brandRow as Brand | null;

  const idea = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  // Learning notes (Mihai's past Yes/Rework) that every maker, Crina's judge and Jev read before working.
  const vault = defaultVault(brand?.name);
  const textLearning = await learningContext(vault, { part: "text" });
  const visualLearning = await learningContext(vault, { part: "visual" });
  // Learning library (ideas, links, images, documents Mihai added) read next to the Yes/Rework notes.
  // Only the ~10 items most relevant to this campaign (brand, keywords, recency); the Library shows which.
  const library = await libraryContext(
    campaign.brand_id,
    [campaign.title, campaign.objective, idea.idea, idea.angle, Array.isArray(idea.platforms) ? idea.platforms.join(" ") : ""].map((x) => (typeof x === "string" ? x : "")).join(" "),
    { part: "run", campaignId: campaign.id }
  );
  const noteText = ownerNote ? `Mihai's note for this rework (follow it exactly): ${ownerNote}` : "";
  const textNotes = [noteText, textLearning.text, library].filter(Boolean).join("\n\n");
  const visualNotes = [noteText, visualLearning.text, library].filter(Boolean).join("\n\n");
  const ownerIdea = String(idea.idea ?? campaign.objective ?? "");
  // Prompt diet: the agents get the idea + the agreed plan, not the whole brief (no blocked drafts,
  // analytics notes or Jev records), and the brand's voice fields only.
  const planCore = (idea.plan ?? null) as Record<string, unknown> | null;
  const ideaSlim = {
    idea: ownerIdea,
    plan: planCore ? { objective: planCore.objective, target_audience: planCore.target_audience, key_message: planCore.key_message, cta: planCore.cta, success_criteria: planCore.success_criteria, seo_keywords: planCore.seo_keywords, hashtags: planCore.hashtags } : null,
    primary_cta: idea.primary_cta ?? null,
    success_criteria: idea.success_criteria ?? null
  };
  const brandVoice = brand ? { name: brand.name, positioning: brand.positioning, target_audience: brand.target_audience, tone_of_voice: brand.tone_of_voice, key_messages: brand.key_messages, proof_points: brand.proof_points, approval_rules: brand.approval_rules, ctas: brand.ctas ?? brand.reusable_ctas } : null;
  // P4a — contract-first (Karpathy III): the judge grades against the campaign's agreed goal, not just
  // the generic rubric. Uses existing campaign data; Codex can add explicit done-criteria templates.
  const contract = String(idea.success_criteria ?? idea.primary_cta ?? campaign.objective ?? "").replace(/\s+/g, " ").slice(0, 300);
  const allPlatforms = Array.isArray(idea.platforms) ? (idea.platforms as string[]) : ["LinkedIn"];
  const platforms = requestedPlatform ? [requestedPlatform] : allPlatforms.slice(0, MAX_PLATFORMS);
  if (requestedPlatform) {
    const rp = requestedPlatform;
    if (!allPlatforms.some((p) => p.toLowerCase() === rp.toLowerCase())) {
      await supabase.from("campaigns").update({ idea_brief: { ...idea, platforms: [...allPlatforms, rp] } }).eq("id", id);
    }
  }
  const schedule = (idea.schedule ?? {}) as { start?: string; from_hour?: string };
  const scheduledAt = schedule.start ? `${schedule.start}T${schedule.from_hour || "09:00"}:00` : null;
  const { count: futureScheduledCount } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", campaign.brand_id)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date().toISOString());

  // Refuse up front if this run could go over the model-call budget or a provider limit is active.
  // Keep Mihai's rework note on the campaign before any refusal, so a budget stop never loses it.
  if (ownerNote) {
    await supabase.from("campaigns").update({ idea_brief: { ...idea, last_rework_note: { note: ownerNote, platform: requestedPlatform, at: new Date().toISOString() } } }).eq("id", id);
    idea.last_rework_note = { note: ownerNote, platform: requestedPlatform, at: new Date().toISOString() };
  }
  const steps = approvedDraft ? [...STEP_AGENTS.approvedTextPlatform, ...STEP_AGENTS.runOverhead] : [...times(STEP_AGENTS.perPlatform, platforms.length), ...STEP_AGENTS.runOverhead];
  const refusedRun = await preflight(id, steps);
  if (refusedRun) {
    const hint = approvedDraft ? "" : ` Or use "Edit and approve" (about ${usd(await estimateUsd([...STEP_AGENTS.approvedTextPlatform, ...STEP_AGENTS.runOverhead]))}).`;
    return NextResponse.json({ error: `${refusedRun}${hint}${ownerNote ? " Your note is saved." : ""}`, budget: true }, { status: 429 });
  }

  await supabase.from("campaigns").update({ status: "active", selected_at: new Date().toISOString(), automation_status: "running", ...(idea.flow === "simple" ? { idea_brief: { ...idea, blocked: null } } : {}) }).eq("id", id);
  // Simple flow: a safety stop is shown to Mihai on Review (with the reason), not left looking like "agents working".
  const markBlocked = async (reason: string, platform: string, kind: "safety" | "failed" = "safety", extra: Record<string, unknown> = {}) => {
    if (idea.flow !== "simple") return;
    await supabase.from("campaigns").update({ idea_brief: { ...idea, blocked: { kind, reason, platform, at: new Date().toISOString(), ...extra } } }).eq("id", id);
  };

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
   // Provider usage limit tripped mid-run: stop cleanly, make nothing more.
   const budgetNow = await getBudgetStatus(id);
   if (budgetNow?.blockedUntil) {
     await markBlocked(`Agents stopped: ${limitMessage(budgetNow.blockedUntil)} Nothing more was made; run the agents again after that.`, platform, "failed");
     created.push({ platform, title: `${platform} (Hermes limit)`, loops: 0, score: 0, stop: "error", blocked: true, fallback: true });
     break;
   }
   try {
    const platformIndex = created.length;
    const itemScheduledAt = scheduledAt ?? pickScheduledAt(defaultRegion(), (futureScheduledCount ?? 0) + platformIndex);
    const memory = await getFeedbackMemoryContext({ brandId: campaign.brand_id, platform });
    const conversion = await getConversionMemoryContext({ brandId: campaign.brand_id, platform });
    const plan = getPlatformPlan(platform);

    // Crina owns visual routing: search the project ASSET LIBRARY first. If a strong, approved,
    // platform-fit asset exists (and Crina hasn't forced new creation), select it and SKIP the
    // Visual Agent. Otherwise the Visual Agent generates a new asset (saved back to the library).
    const projectSlug = resolveProjectSlug(brand ? { id: brand.id, name: brand.name } : null);
    const forceNewVisual = idea.force_new_visual === true;
    const kindMatch: Record<string, string[]> = { image: ["image", "logo", "reference"], carousel: ["carousel"], video: ["video"] };
    let selectedAsset: ProjectAsset | null = null;
    if (projectSlug && !forceNewVisual) {
      const candidates = await findAssetCandidates({ projectSlug, platform });
      selectedAsset = candidates.find((a) => (kindMatch[plan.assetKind] ?? []).includes(a.asset_type) && a.file_url) ?? null;
    }
    const assetRouteNotes = selectedAsset
      ? `Crina selected library asset "${selectedAsset.title}" (${selectedAsset.asset_type}) for ${platform} — matched platform + theme; Visual Agent skipped.`
      : forceNewVisual
        ? `Crina forced NEW visual for ${platform}; Visual Agent generating.`
        : projectSlug
          ? `No suitable library asset for ${platform}; Visual Agent generating new (saved back to library, unapproved).`
          : `No project mapped for this brand; Visual Agent generating.`;
    const assetCopyHint = selectedAsset
      ? `\n\nIMPORTANT: You are writing copy AROUND an existing approved visual (do NOT describe a new image). Asset: "${selectedAsset.title}"${selectedAsset.description ? ` — ${selectedAsset.description}` : ""}${selectedAsset.content_theme ? ` (theme: ${selectedAsset.content_theme})` : ""}. Make the hook, caption, and CTA fit THIS specific visual.`
      : "";

    // The last judged artifact per kind + the sentences the judge flagged (shown on Review when blocked).
    const lastJudged: Record<string, { artifact: unknown; flagged: string[] }> = {};
    // Crina judges a candidate against a rubric -> a numeric, bounded acceptance check.
    const judgeWith = async (rubric: string, artifactLabel: string, artifact: unknown): Promise<JudgeResult> => {
      const review = await runMarketingAgentModel({
        agentId: "agent-crina",
        fallbackAgentName: "Crina",
        fallbackRole: "Marketing CEO Agent",
        task: `Judge ${artifactLabel}`,
        instructions: `${HONEST_GRADER_PREAMBLE}\n\n${rubric}${contract ? `\n\nCONTRACT — the ${artifactLabel} must advance the campaign's agreed goal: "${contract}". Dock points for anything that does not serve it.` : ""}\n\nYou are Crina, the CEO, scoring a specialist's ${artifactLabel} for ${platform}. Weigh the operator's past feedback and what converts. Also answer Jev's checks for this ${artifactLabel}; any that fails must lower the score below the pass mark and appear in improvements:\n${jevQuestions(artifactLabel === "visual" ? "visual" : "text").map((q) => `- ${q.text}`).join("\n")}\n\nReturn the rubric score (0-100), per-dimension scores, safety_pass (false on ANY safety/compliance issue), flagged_sentences (the EXACT sentences copied from the ${artifactLabel} that are unsafe or can't be verified; empty when none), concise judge_notes, and specific improvements the maker can apply next round.\n\nMemory:\n${memoryText(memory)}\n\n${artifactLabel === "visual" ? visualNotes : textNotes}\n\nWhat converts:\n${conversionMemoryText(conversion)}`,
        outputSchema: judgeSchema,
        input: { brand: brandVoice, platform, [artifactLabel]: artifact, campaign_idea: ideaSlim, conversion_insights: conversion.insights },
        brainFiles: ["workflow-contract.md", "approval-rules.md", "grader-calibration.md"],
        temperature: 0.2,
        routeOrigin: "api.marketing.campaigns.run"
      });
      const j = (review.json ?? {}) as Record<string, unknown>;
      lastJudged[artifactLabel] = { artifact, flagged: Array.isArray(j.flagged_sentences) ? j.flagged_sentences.map(String).filter((x) => x.trim()).slice(0, 10) : [] };
      return {
        score: clampScore(j.score),
        safetyPass: !(j.safety_pass === false),
        judgeNotes: typeof j.judge_notes === "string" ? j.judge_notes : "",
        improvements: Array.isArray(j.improvements) ? j.improvements.map(String) : [],
        fallbackUsed: !review.ok || review.fallbackUsed,
        tokensTotal: review.usage.tokensTotal,
        latencyMs: review.durationMs
      };
    };

    // Content Creator maker: used by Crina's loop and again by Jev's automatic rework.
    let lastMakerError: string | null = null;
    const makeContent = async (improvements: string[], champion: NativeDraft | null) => {
        const content = await runMarketingAgentModel({
          agentId: "agent-content-creator",
          fallbackAgentName: "Content Creator Agent",
          fallbackRole: "Copy and Editorial",
          task: `Create ${plan.label} package`,
          instructions: `${plan.contentInstructions}${assetCopyHint}\n\nUse the brand voice and the campaign idea. Address the operator's past feedback and what converts. Do not publish. Every field you return is PUBLIC copy readers will see: never put internal notes, approval caveats, questions for Mihai, "subject to confirmation" remarks or tracking instructions into it.\n\nMemory:\n${memoryText(memory)}\n\n${textNotes}\n\nWhat converts (bias toward these):\n${conversionMemoryText(conversion)}${improvements.length ? `\n\nFix these before anything else:\n- ${improvements.join("\n- ")}` : ""}`,
          outputSchema: plan.contentSchema,
          input: { brand: brandVoice, campaign_idea: ideaSlim, platform, previous: champion, conversion_insights: conversion.insights },
          brainFiles: ["content-formulas.md", "approval-rules.md"],
          temperature: 0.5,
          routeOrigin: "api.marketing.campaigns.run"
        });
        const draft = plan.normalize(content.json);
        if (!draft) lastMakerError = content.error ?? "the answer did not match the post format";
        return {
          candidate: draft,
          outputSummary: draft ? `${draft.title} — ${draft.hook}`.slice(0, 180) : "no draft produced",
          provider: content.provider,
          model: content.modelUsed,
          fallbackUsed: !draft || content.fallbackUsed,
          tokensPrompt: content.usage.tokensPrompt,
          tokensCompletion: content.usage.tokensCompletion,
          tokensTotal: content.usage.tokensTotal,
          latencyMs: content.durationMs
        };
      };

    // 1) Content loop — Content Creator makes a PLATFORM-NATIVE package, Crina scores, keep champion.
    const ownerApproved = approvedDraft && requestedPlatform && platform.toLowerCase() === requestedPlatform.toLowerCase() ? approvedDraft : null;
    const contentLoop: LoopResult<NativeDraft> = ownerApproved
      ? { loopId: `owner-${Date.now()}`, champion: ownerApproved, championScore: 0, rounds: 0, stopReason: "pass", passed: true, lastJudgeNotes: "Text edited and approved by Mihai over the safety check.", lastScore: 0, fallbackUsed: false, provider: "mihai", model: null }
      : await runJudgedLoop<NativeDraft>({
      loopType: "content",
      agentId: "agent-content-creator",
      inputSummary: `${plan.label} ${plan.contentType} for "${campaign.title}"`,
      // Add-one-platform is interactive: keep it to a single round so it returns fast on a slow model.
      // At most one automatic rework (2 rounds); more only when Mihai presses Rework.
      maxRounds: requestedPlatform && !ownerNote ? 1 : CONTENT_ROUNDS,
      recordReceipt,
      make: async (_round, improvements, champion) => makeContent(improvements, champion),
      judge: async (candidate) => judgeWith(CONTENT_RUBRIC, "post", candidate)
    });

    // Spec: ANY content safety stop => NO postable package, even if an earlier round was a champion.
    if (contentLoop.stopReason === "safety") {
      // A safety refusal is the gate working, not a failure: record it as "blocked" with a plain reason.
      const reason = safetyBlockReason("content", contentLoop.lastScore, brand, contentLoop.lastJudgeNotes);
      // Keep the blocked draft and the flagged sentences: Review shows them with "Rework with my note" / "Edit and approve".
      await markBlocked(reason, platform, "safety", { draft: lastJudged.post?.artifact ?? null, flagged: lastJudged.post?.flagged ?? [], judge_notes: contentLoop.lastJudgeNotes, score: contentLoop.lastScore });
      await recordAgentRun({
        agentName: "Campaign Run",
        agentId: "agent-crina",
        workflowName: "Run Campaign (per-platform)",
        provider: contentLoop.provider,
        status: "blocked",
        input: { campaignId: id, platform, brand: brand?.name ?? null, routeOrigin: "api.marketing.campaigns.run" },
        output: { summary: reason, platform, content_stop: "safety", content_rounds: contentLoop.rounds, safety_score: contentLoop.lastScore, judge_notes: contentLoop.lastJudgeNotes, placeholder_fields: brandGaps(brand).placeholder, blocked: true },
        error: null,
        model: contentLoop.model,
        durationMs: 0
      });
      created.push({ platform, title: `${platform} (safety-blocked)`, loops: contentLoop.rounds, score: contentLoop.championScore, stop: "safety", blocked: true, fallback: true });
      continue;
    }

    // Simple flow: if the Content Creator produced nothing (model down, usage limit, bad output), make NO
    // stand-in post from the plan text — Mihai would be reviewing text no agent wrote. Show why instead.
    if (idea.flow === "simple" && !contentLoop.champion) {
      const why = lastMakerError ?? contentLoop.lastJudgeNotes ?? "no draft produced";
      await markBlocked(`Agents failed: the Content Creator produced no post (${why.slice(0, 200)}). Nothing was made; run the agents again later.`, platform, "failed");
      await recordAgentRun({ agentName: "Campaign Run", agentId: "agent-crina", workflowName: "Run Campaign (per-platform)", provider: contentLoop.provider, status: "error", input: { campaignId: id, platform, brand: brand?.name ?? null, routeOrigin: "api.marketing.campaigns.run" }, output: { platform, content_stop: contentLoop.stopReason }, error: `Content Creator produced no post: ${why.slice(0, 200)}`, model: contentLoop.model, durationMs: 0 });
      created.push({ platform, title: `${platform} (agents failed)`, loops: contentLoop.rounds, score: 0, stop: "error", blocked: true, fallback: true });
      continue;
    }

    const contentFallback = contentLoop.fallbackUsed || !contentLoop.champion;
    let draft: NativeDraft = contentLoop.champion ?? {
      title: `${plan.label}: ${campaign.title}`,
      hook: String(idea.hook ?? ""),
      body: String(idea.summary ?? campaign.title),
      cta: String(idea.primary_cta ?? "Learn more"),
      hashtags: []
    };

    // Lean pipeline: Jev's checks are inside Crina's single review above (no separate Jev loop).

    const contentType = plan.contentType;
    const reviewChip = ownerApproved ? "Text edited and approved by Mihai" : `${contentLoop.championScore}/100 · ${contentLoop.rounds} round(s) · ${contentLoop.stopReason}`;

    // Insert at a NON-postable visual stage; only promoted to the human gate after the Visual loop
    // clears safety, so a visual safety-block never reaches Ready to Post.
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
        status: "visual",
        approval_status: "not_requested",
        workflow_stage: "visual_creation",
        current_owner: "Visual & Video Agent",
        next_owner: "Crina",
        assigned_agent: "Content Creator Agent",
        scheduled_at: itemScheduledAt,
        loop_iteration: contentLoop.rounds,
        crina_review_notes: reviewChip
      })
      .select("id")
      .single();

    if (insErr || !item) {
      created.push({ platform, title: draft.title, loops: contentLoop.rounds, score: contentLoop.championScore, stop: contentLoop.stopReason, fallback: true });
      continue;
    }

    // 2) Assets — per platform. image: Crina-judged single image. carousel: N slides. video:
    // script + storyboard placeholder (validation blocks until the video pipeline exists).
    const loopIds = [contentLoop.loopId];
    let visualUrl: string | null = null;
    let visualStatus: "not_requested" | "generated" | "placeholder" | "error" = "not_requested";
    let visualScore = 0;
    const assets: ReadyPackageAsset[] = [];
    let assetFallback = false;
    let imageProvider: string | null = null;

    if (selectedAsset) {
      // Crina selected an existing library asset — Visual Agent skipped entirely.
      const assetKindLabel: ReadyPackageAsset["kind"] =
        selectedAsset.asset_type === "video" ? "video_placeholder" : selectedAsset.asset_type === "carousel" ? "carousel_slide" : "image";
      visualUrl = selectedAsset.file_url;
      visualStatus = selectedAsset.file_url ? "generated" : "not_requested";
      visualScore = selectedAsset.quality_score;
      imageProvider = `library:${selectedAsset.source_tool}`;
      assets.push({ kind: assetKindLabel, url: selectedAsset.file_url, prompt: selectedAsset.description ?? selectedAsset.title, position: 1, status: selectedAsset.file_url ? "generated" : "placeholder", provider: `library:${selectedAsset.source_tool}` });
      await recordAssetUsage({ assetId: selectedAsset.id, contentItemId: item.id as string, campaignId: id, platform, reused: selectedAsset.used_count > 0 });
    } else if (plan.assetKind === "image") {
      // Visual maker: used by Crina's loop and again by Jev's automatic rework.
      const makeVisual = async (improvements: string[], champion: VisualConcept | null) => {
          const v = await runMarketingAgentModel({
            agentId: "agent-visual-video",
            fallbackAgentName: "Visual & Video Agent",
            fallbackRole: "Visual Concepts",
            task: `Concept a ${plan.label} visual`,
            instructions: `Propose ONE visual concept + an image-generation prompt for this approved ${plan.label} post. Match the brand and the post's message. Brand-safe; no text in the image; no real-person likeness; no unapproved logos.\n\n${visualNotes}${improvements.length ? `\n\nFix these before anything else:\n- ${improvements.join("\n- ")}` : ""}`,
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
          return { candidate, outputSummary: (concept || prompt).slice(0, 180) || "no concept produced", provider: v.provider, model: v.modelUsed, fallbackUsed: !candidate || v.fallbackUsed, tokensPrompt: v.usage.tokensPrompt, tokensCompletion: v.usage.tokensCompletion, tokensTotal: v.usage.tokensTotal, latencyMs: v.durationMs };
        };
      const visualLoop = await runJudgedLoop<VisualConcept>({
        loopType: "visual",
        agentId: "agent-visual-video",
        inputSummary: `Visual for "${draft.title}" (${plan.label})`,
        maxRounds: VISUAL_MAX_ROUNDS,
        recordReceipt,
        make: async (_round, improvements, champion) => makeVisual(improvements, champion),
        judge: async (candidate) => judgeWith(VISUAL_RUBRIC, "visual", candidate)
      });
      loopIds.push(visualLoop.loopId);
      visualScore = visualLoop.championScore;

      if (visualLoop.stopReason === "safety") {
        await supabase.from("loop_receipts").update({ content_item_id: item.id }).in("loop_id", loopIds);
        await supabase.from("content_items").update({ status: "draft", approval_status: "changes_requested", workflow_stage: "rework", current_owner: "Crina", next_owner: "Visual & Video Agent", visual_asset_status: "error", crina_review_notes: `${reviewChip} · VISUAL SAFETY-BLOCKED`, performance_summary: `BLOCKED: visual safety violation. ${visualLoop.lastJudgeNotes.slice(0, 160)}` }).eq("id", item.id);
        await markBlocked(safetyBlockReason("visual", visualLoop.lastScore, brand, visualLoop.lastJudgeNotes), platform);
        await recordAgentRun({ agentName: "Campaign Run", agentId: "agent-crina", workflowName: "Run Campaign (per-platform)", provider: contentLoop.provider, status: "blocked", input: { campaignId: id, platform, brand: brand?.name ?? null, routeOrigin: "api.marketing.campaigns.run" }, output: { summary: safetyBlockReason("visual", visualLoop.lastScore, brand), platform, content_score: contentLoop.championScore, visual_stop: "safety", safety_score: visualLoop.lastScore, judge_notes: visualLoop.lastJudgeNotes, blocked: true }, error: null, model: contentLoop.model, durationMs: 0 });
        created.push({ platform, title: draft.title, loops: contentLoop.rounds, score: contentLoop.championScore, stop: "visual_safety", blocked: true, fallback: true });
        continue;
      }

      // Lean pipeline: Jev's visual checks are inside Crina's single visual review (no separate Jev loop).
      const visualChampion = visualLoop.champion;
      const usingGeneric = !visualChampion;
      const prompt = visualChampion ? visualChampion.prompt : `Professional ${plan.label} visual for ${brand?.name ?? "the brand"}. Concept: ${draft.title}. ${draft.hook}. Clean, brand-safe, high detail, no text in the image.`;
      const image = await generateMarketingImage(prompt, { contentItemId: item.id as string, position: 1, kind: "image" });
      visualUrl = image.url;
      visualStatus = image.status;
      imageProvider = image.provider;
      assets.push({ kind: "image", url: image.url, prompt, position: 1, status: image.status, provider: image.provider });
      assetFallback = image.status !== "generated" || usingGeneric || visualLoop.fallbackUsed;
    } else if (plan.assetKind === "carousel") {
      const slides = draft.slides ?? [];
      const count = Math.min(Math.max(slides.length, plan.carouselCount, 3), 7);
      for (let i = 0; i < count; i += 1) {
        const slide = slides[i];
        const prompt = [
          `Instagram carousel slide ${i + 1} of ${count} for ${brand?.name ?? "the brand"}.`,
          `Slide headline: ${slide?.headline || draft.hook || draft.title}.`,
          slide?.text ? `Slide message: ${slide.text}.` : null,
          `Campaign caption context: ${draft.body}.`,
          "Premium photorealistic infrastructure visual, clean composition, on-brand, high detail, no readable text in the image."
        ]
          .filter(Boolean)
          .join(" ");
        const img = await generateMarketingImage(prompt, { contentItemId: item.id as string, position: i + 1, kind: "carousel_slide", aspect: "square" });
        const composedUrl = await composeCarouselSlide({
          backgroundUrl: img.url,
          contentItemId: item.id as string,
          position: i + 1,
          total: count,
          brandName: brand?.name,
          headline: slide?.headline || draft.hook || draft.title,
          text: slide?.text,
          footer: draft.cta
        });
        if (img.status !== "generated") assetFallback = true;
        imageProvider = img.provider;
        assets.push({ kind: "carousel_slide", url: composedUrl ?? img.url, prompt, position: i + 1, status: img.status, provider: img.provider });
      }
      visualUrl = assets[0]?.url ?? null;
      visualStatus = (assets[0]?.status as typeof visualStatus) ?? "not_requested";
    } else {
      // video: no image generated — the video pipeline is pending, so this stays validation-blocked.
      assets.push({ kind: "video_placeholder", url: null, prompt: draft.script ?? null, position: 1, status: "placeholder" });
      assetFallback = true;
    }

    await supabase.from("loop_receipts").update({ content_item_id: item.id }).in("loop_id", loopIds);

    // Save a freshly generated asset back into the library (unapproved, single-use) so the operator
    // can review/promote it and the Visual Agent can avoid repeating it on this platform later.
    if (!selectedAsset && projectSlug && visualUrl && visualStatus === "generated") {
      const saved = await createProjectAsset({
        project_slug: projectSlug,
        brand_id: campaign.brand_id,
        file_url: visualUrl,
        asset_type: plan.assetKind === "carousel" ? "carousel" : "image",
        title: `${plan.label}: ${draft.title}`.slice(0, 120),
        description: `Auto-generated for ${platform}. ${draft.hook}`.slice(0, 240),
        platform_fit: [platform.toLowerCase()],
        content_theme: String(idea.theme ?? idea.summary ?? campaign.title).slice(0, 120),
        source_tool: "other",
        quality_score: visualScore,
        reuse_allowed: false,
        approved: false
      });
      if (saved) await recordAssetUsage({ assetId: saved.id, contentItemId: item.id as string, campaignId: id, platform, reused: false });
    }

    const fallbackParts = [contentFallback ? "content" : null, assetFallback ? (plan.assetKind === "video" ? "video-pending" : "asset") : null].filter(Boolean) as string[];
    const anyFallback = fallbackParts.length > 0;
    const fbNote = anyFallback ? `FALLBACK[${fallbackParts.join(",")}] ` : "";

    const readyPackage = {
      platform,
      content_type: plan.contentType,
      title: draft.title,
      text: draft.body,
      caption: draft.body,
      hashtags: draft.hashtags,
      alt_text: `Visual for ${draft.title}`,
      scheduled_at: itemScheduledAt,
      crina_score: contentLoop.championScore,
      crina_loops: contentLoop.rounds,
      visual_score: visualScore,
      image_provider: imageProvider,
      fallback_used: anyFallback,
      assets,
      slides: draft.slides,
      script: draft.script,
      storyboard: draft.storyboard,
      video_status: plan.assetKind === "video" ? ("coming_soon" as const) : undefined,
      asset_source: selectedAsset ? ("library" as const) : ("generated" as const),
      selected_asset_id: selectedAsset?.id ?? null,
      selected_asset_title: selectedAsset?.title ?? null,
      project_slug: projectSlug ?? null,
      reuse_allowed: selectedAsset?.reuse_allowed ?? null,
      crina_route_notes: assetRouteNotes,
      jev: { merged: "Jev's checks are part of Crina's single review of the text and of the visual." }
    };

    await saveContentAssets(item.id as string, assets);

    await supabase
      .from("content_items")
      .update({
        status: "approval",
        approval_status: "pending",
        workflow_stage: "human_final_approval",
        current_owner: "Human",
        next_owner: "Publishing Agent",
        visual_asset_url: visualUrl,
        visual_asset_status: visualStatus,
        ready_package: readyPackage,
        performance_summary: `${fbNote}Crina ${reviewChip}. ${plan.contentType}. Provider ${contentLoop.provider}/${contentLoop.model ?? "default"}.`
      })
      .eq("id", item.id);

    await recordAgentRun({
      agentName: "Campaign Run",
      agentId: "agent-crina",
      workflowName: "Run Campaign (per-platform)",
      provider: contentLoop.provider,
      status: anyFallback ? "fallback" : "success",
      input: { campaignId: id, platform, brand: brand?.name ?? null, routeOrigin: "api.marketing.campaigns.run" },
      output: { platform, content_type: plan.contentType, asset_kind: plan.assetKind, content_score: contentLoop.championScore, visual_score: visualScore, assets: assets.length, fallback_parts: fallbackParts },
      error: anyFallback ? `Fallback: ${fallbackParts.join(", ")}.` : null,
      model: contentLoop.model,
      durationMs: 0
    });

    created.push({ platform, title: draft.title, loops: contentLoop.rounds, score: contentLoop.championScore, stop: contentLoop.stopReason, fallback: anyFallback });
   } catch (error) {
     console.error(`[campaigns/run] platform ${platform} failed:`, error);
     // Add-platform mode: surface the real reason instead of a silent 500.
     if (requestedPlatform) return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed." }, { status: 500 });
     // Full run: one platform failing must not kill the others.
     created.push({ platform, title: `${platform} (error)`, loops: 0, score: 0, stop: "error", fallback: true });
   }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  let notifications: Awaited<ReturnType<typeof sendCrinaReadyToPostPings>> | null = null;
  try {
    notifications = await sendCrinaReadyToPostPings({ campaignIds: [id], baseUrl });
  } catch (error) {
    console.error("[campaigns/run] Crina pings failed (non-fatal):", error);
  }

  // Close the loop: refresh conversion estimates + insights for the next run (best-effort).
  try {
    await runConversionAnalysis({ brandId: campaign.brand_id, campaignId: id });
  } catch {
    // never break the run on conversion-analysis failure
  }

  if (!requestedPlatform && created.length) {
    void notifyOperator(`🏁 Campaign "${campaign.title}" finished — ${created.length} package(s) ready to review:\n${created.map((c) => `• ${c.platform} ${c.score}/100${c.blocked ? " (blocked)" : ""}`).join("\n")}`);
  }

  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing/ready-to-post");
  revalidatePath("/marketing/pipeline");
  return NextResponse.json({ campaign_id: id, posts_created: created.length, posts: created, notifications });
}
