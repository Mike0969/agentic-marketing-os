import { subAgentConfigs, type SubAgentKey } from "@/lib/agents/agent-catalog";
import { runSubAgent } from "@/lib/agents/sub-agent-runner";
import { runHermesAgent } from "@/lib/agents/hermes-client";
import { generateVisualAsset } from "@/lib/agents/visual-asset-generator";
import { getContentItem, updateContentItem } from "@/lib/content-store";
import { getDashboardData } from "@/lib/data";
import type { ContentItem, ContentStatus } from "@/lib/types";

/**
 * Approval-gated dispatch. After a human approves a Crina plan item, the item's
 * assigned specialist runs on THAT item and writes its output back onto the same
 * card, advancing it through the pipeline. Nothing is published.
 */

function keyForAgent(assignedAgent: string): SubAgentKey {
  const name = assignedAgent.toLowerCase();
  if (name.includes("seo")) return "seo";
  if (name.includes("visual") || name.includes("video")) return "visual-video";
  if (name.includes("competitor")) return "competitor-intelligence";
  if (name.includes("analytic")) return "analytics";
  if (name.includes("publish")) return "publishing";
  return "content-creator"; // Crina ideas + Content Creator both draft copy
}

type DispatchPatch = Partial<ContentItem> & { status: ContentStatus };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatList(values: unknown[], formatter?: (value: unknown, index: number) => string): string[] {
  return values.map((value, index) => (formatter ? formatter(value, index) : asString(value))).filter(Boolean);
}

function mapOutputToPatch(key: SubAgentKey, output: Record<string, unknown>): DispatchPatch {
  switch (key) {
    case "content-creator": {
      const draft = asRecord(asArray(output.drafts)[0]);
      return {
        status: "draft",
        title: asString(draft.title) || undefined,
        body: [asString(draft.body), formatList(asArray(draft.claimsToReview)).length ? `Claims to review:\n- ${formatList(asArray(draft.claimsToReview)).join("\n- ")}` : ""].filter(Boolean).join("\n\n"),
        hook: asString(draft.hook),
        CTA: asString(draft.CTA)
      };
    }
    case "seo": {
      const brief = asRecord(output.blogBrief);
      const themes = formatList(asArray(output.keywordThemes), (theme) => {
        if (typeof theme === "string") return theme;
        const row = asRecord(theme);
        return [asString(row.theme), asString(row.intent), asString(row.priority), asString(row.rationale)].filter(Boolean).join(" | ");
      });
      const outline = formatList(asArray(brief.outline));
      const serpAngles = formatList(asArray(output.serpAngles));
      const proofNeeded = formatList(asArray(brief.proofNeeded));
      const internalLinks = formatList(asArray(brief.internalLinks));
      const technicalRecommendations = formatList(asArray(output.technicalRecommendations));
      return {
        status: "draft",
        content_type: "SEO blog brief",
        title: asString(brief.title) || undefined,
        CTA: asString(brief.cta),
        body: [
          asString(output.searchObjective) ? `Search objective: ${asString(output.searchObjective)}` : "",
          asString(brief.targetKeyword) ? `Target keyword: ${asString(brief.targetKeyword)}` : "",
          themes.length ? `Keyword themes:\n- ${themes.join("\n- ")}` : "",
          serpAngles.length ? `SERP angles:\n- ${serpAngles.join("\n- ")}` : "",
          outline.length ? `Outline:\n- ${outline.join("\n- ")}` : "",
          proofNeeded.length ? `Proof needed:\n- ${proofNeeded.join("\n- ")}` : "",
          internalLinks.length ? `Internal links:\n- ${internalLinks.join("\n- ")}` : "",
          technicalRecommendations.length ? `Technical recommendations:\n- ${technicalRecommendations.join("\n- ")}` : ""
        ]
          .filter(Boolean)
          .join("\n\n")
      };
    }
    case "visual-video": {
      const imagePrompt = asString(output.imagePrompt);
      const carousel = asRecord(asArray(output.carouselConcepts)[0]);
      const script = asRecord(asArray(output.shortVideoScripts)[0]);
      const slides = formatList(asArray(carousel.slides), (slide) => {
        if (typeof slide === "string") return slide;
        const row = asRecord(slide);
        return [row.slide ? `Slide ${String(row.slide)}` : "", asString(row.headline), asString(row.visualDirection), asString(row.supportingCopy)].filter(Boolean).join(" — ");
      });
      const beats = formatList(asArray(script.beats));
      const onScreenText = formatList(asArray(script.onScreenText));
      const storyboardBriefs = formatList(asArray(output.storyboardBriefs));
      const assetNotes = formatList(asArray(output.assetNotes));
      const lines = [
        imagePrompt ? `Image generation prompt:\n${imagePrompt}` : "",
        asString(carousel.title) || slides.length ? `Carousel: ${asString(carousel.title) || "Concept"}\n- ${slides.join("\n- ")}` : "",
        asString(script.title) || beats.length ? `Short video: ${asString(script.title) || "Script"}\n- ${beats.join("\n- ")}` : "",
        onScreenText.length ? `On-screen text:\n- ${onScreenText.join("\n- ")}` : "",
        asString(script.voiceover) ? `Voiceover:\n${asString(script.voiceover)}` : "",
        storyboardBriefs.length ? `Storyboard:\n- ${storyboardBriefs.join("\n- ")}` : "",
        assetNotes.length ? `Asset notes:\n- ${assetNotes.join("\n- ")}` : ""
      ].filter(Boolean);
      return { status: "visual", content_type: "Creative direction", body: lines.join("\n\n") || "Creative direction prepared." };
    }
    case "competitor-intelligence": {
      const patterns = formatList(asArray(output.winningPatterns), (pattern) => {
        const row = asRecord(pattern);
        return [asString(row.sourceLabel), asString(row.hookSkeleton), asString(row.whyItWorked), asString(row.adaptFor)].filter(Boolean).join(" | ");
      });
      const angles = formatList(asArray(output.recommendedAngles));
      return {
        status: "brief",
        content_type: "Competitor intelligence brief",
        body: [patterns.length ? `Winning patterns:\n- ${patterns.join("\n- ")}` : "", angles.length ? `Recommended angles:\n- ${angles.join("\n- ")}` : ""].filter(Boolean).join("\n\n")
      };
    }
    case "publishing": {
      const draftPackage = asRecord(output.draftPackage);
      const schedule = asRecord(output.suggestedScheduleMetadata);
      const checklist = formatList(asArray(output.readinessChecklist));
      return {
        status: "draft",
        content_type: `Platform draft package${asString(draftPackage.formattedFor) ? ` - ${asString(draftPackage.formattedFor)}` : ""}`,
        title: asString(draftPackage.title) || undefined,
        body: [
          asString(draftPackage.body),
          formatList(asArray(draftPackage.hashtags)).length ? `Hashtags: ${formatList(asArray(draftPackage.hashtags)).join(" ")}` : "",
          formatList(asArray(draftPackage.assetNotes)).length ? `Asset notes:\n- ${formatList(asArray(draftPackage.assetNotes)).join("\n- ")}` : "",
          asString(draftPackage.altText) ? `Alt text: ${asString(draftPackage.altText)}` : "",
          asString(schedule.suggestedTime) ? `Suggested time: ${asString(schedule.suggestedTime)} ${asString(schedule.timezone)}` : "",
          asString(schedule.reason) ? `Timing reason: ${asString(schedule.reason)}` : "",
          checklist.length ? `Readiness checklist:\n- ${checklist.join("\n- ")}` : ""
        ]
          .filter(Boolean)
          .join("\n\n")
      };
    }
    case "analytics": {
      const topContent = formatList(asArray(output.topContent), (row) => {
        const item = asRecord(row);
        return [asString(item.title), asString(item.reason), asString(item.metricSignal)].filter(Boolean).join(" | ");
      });
      const weakContent = formatList(asArray(output.weakContent), (row) => {
        const item = asRecord(row);
        return [asString(item.title), asString(item.reason), asString(item.recommendedFix)].filter(Boolean).join(" | ");
      });
      const nextBestActions = formatList(asArray(output.nextBestActions));
      return {
        status: "analyzed",
        content_type: "Performance summary",
        performance_summary: asString(output.summary),
        body: [
          asString(output.summary),
          asString(output.dataQuality) ? `Data quality: ${asString(output.dataQuality)}` : "",
          topContent.length ? `Top content:\n- ${topContent.join("\n- ")}` : "",
          weakContent.length ? `Weak content:\n- ${weakContent.join("\n- ")}` : "",
          nextBestActions.length ? `Next actions:\n- ${nextBestActions.join("\n- ")}` : ""
        ]
          .filter(Boolean)
          .join("\n\n")
      };
    }
    default:
      return { status: "draft", body: JSON.stringify(output).slice(0, 1200) };
  }
}

export type DispatchResult = {
  ok: boolean;
  item: ContentItem | null;
  agent: string;
  provider: "hermes" | "deterministic";
  fallback: boolean;
  error: string | null;
};

function packageBody(parts: Array<[string, string | null | undefined]>) {
  return parts
    .filter(([, value]) => value && value.trim())
    .map(([label, value]) => `${label}\n${value}`)
    .join("\n\n---\n\n");
}

function extractVisualDirection(body: string) {
  return body.split(/\n\n---\n\nVISUAL \/ VIDEO DIRECTION\n/)[1]?.trim() ?? "";
}

async function markStage(item: ContentItem, patch: Partial<ContentItem>, label: string, detail: string) {
  await updateContentItem(item.id, patch, { label, detail });
}

async function crinaReview(stage: "content_review" | "final_review", input: Record<string, unknown>) {
  const result = await runHermesAgent({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: stage === "content_review" ? "Review Content Creator Draft" : "Final Review Content Package",
    instructions:
      stage === "content_review"
        ? "Review the content creator draft for strategy, brand fit, platform fit, proof strength, and handoff needs for Visual & Video. Return concise JSON. Do not ask the human yet unless the draft is unusable."
        : "Review the full copy + visual package as Crina. Decide whether it is ready for human final approval. Return concise JSON with approval notes, risks, and final package summary. Do not publish.",
    outputSchema: {
      readyForNextStep: "boolean",
      reviewNotes: "string",
      handoffSummary: "string",
      risks: ["string"],
      requestedImprovements: ["string"]
    },
    input,
    brainFiles: ["brand-briefs.md", "approval-rules.md", "brand-voice.md", "workflow-contract.md", "agent-crina-memory.md"],
    handoffFrom: stage === "content_review" ? "Content Creator Agent" : "Visual & Video Agent",
    handoffTo: stage === "content_review" ? "Visual & Video Agent" : "Human Final Approval"
  });

  if (result.ok && result.json && typeof result.json === "object") {
    return { output: result.json as Record<string, unknown>, fallback: false, error: null as string | null };
  }

  return {
    output: {
      readyForNextStep: true,
      reviewNotes: result.error ? `Crina review fallback: ${result.error}` : "Crina review fallback completed.",
      handoffSummary: "Continue the workflow with human review required before publishing.",
      risks: ["Fallback review; human should inspect carefully."],
      requestedImprovements: []
    },
    fallback: true,
    error: result.error
  };
}

export async function dispatchContentItem(contentItemId: string): Promise<DispatchResult> {
  const item = await getContentItem(contentItemId);
  if (!item) return { ok: false, item: null, agent: "", provider: "deterministic", fallback: true, error: "Content item not found." };

  const firstKey = keyForAgent(item.assigned_agent);
  const firstConfig = subAgentConfigs[firstKey];
  const data = await getDashboardData();
  const brand = data.brands.find((b) => b.id === item.brand_id);
  const errors: string[] = [];
  let fallback = false;
  let current = item;

  if (item.workflow_stage === "human_final_approval") {
    return { ok: true, item, agent: "Crina", provider: "hermes", fallback: false, error: null };
  }

  const input = {
    title: item.title,
    platform: item.platform,
    contentType: item.content_type,
    contentItemId: item.id,
    assignedAgent: item.assigned_agent,
    brief: { title: item.title, hook: item.hook, body: item.body, platform: item.platform, content_type: item.content_type, CTA: item.CTA },
    brand: brand
      ? {
          name: brand.name,
          website: brand.website,
          positioning: brand.positioning,
          tone: brand.tone_of_voice,
          audience: brand.target_audience,
          contentPillars: brand.content_pillars,
          keyMessages: brand.key_messages,
          proofPoints: brand.proof_points,
          offers: brand.offers,
          competitors: brand.competitors,
          seoTargets: brand.seo_targets,
          approvalRules: brand.approval_rules,
          reusableCtas: brand.reusable_ctas
        }
      : null,
    instruction: "Produce a draft for this specific approved item. Drafts only — never publish."
  };

  const needsContentWriting = !["crina_content_review", "visual_creation", "crina_final_review"].includes(current.workflow_stage ?? "");

  if (needsContentWriting) {
    await markStage(
      current,
      {
        status: "draft",
        approval_status: "not_requested",
        workflow_stage: "content_creation",
        current_owner: firstConfig.agentName,
        next_owner: "Crina",
        performance_summary: `With ${firstConfig.agentName}. Producing the approved Crina plan. Started ${new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })} Dubai time.`,
        agent_handoff_summary: `Crina approved this plan for production and handed it to ${firstConfig.agentName}.`
      },
      `${firstConfig.agentName} started work`,
      `${item.title} is now in execution.`
    );

    current = (await getContentItem(item.id)) ?? current;
    const contentResult = await runSubAgent(firstConfig, input);
    const contentPatch = mapOutputToPatch(firstKey, contentResult.output);
    fallback = fallback || contentResult.fallback;
    if (contentResult.error) errors.push(contentResult.error);

    await markStage(
      current,
      {
        ...contentPatch,
        approval_status: "not_requested",
        workflow_stage: "crina_content_review",
        current_owner: "Crina",
        next_owner: "Visual & Video Agent",
        performance_summary: `${contentResult.agent} finished ${contentResult.fallback ? "with fallback" : "through Hermes"}. With Crina for strategy review.`,
        agent_handoff_summary: `${contentResult.agent} handed draft output back to Crina.`
      },
      `${contentResult.agent} handed draft to Crina`,
      `${item.title} is now with Crina for content review.`
    );
    current = (await getContentItem(item.id)) ?? current;
  }

  let reviewNotes = current.crina_review_notes ?? "";
  let handoffSummary = current.agent_handoff_summary ?? "";

  if (current.workflow_stage !== "visual_creation" && current.workflow_stage !== "crina_final_review") {
    const crinaContentReview = await crinaReview("content_review", {
      brand,
      originalPlan: input.brief,
      contentDraft: { title: current.title, hook: current.hook, body: current.body, CTA: current.CTA, platform: current.platform }
    });
    fallback = fallback || crinaContentReview.fallback;
    if (crinaContentReview.error) errors.push(crinaContentReview.error);
    reviewNotes = asString(crinaContentReview.output.reviewNotes);
    handoffSummary = asString(crinaContentReview.output.handoffSummary);

    await markStage(
      current,
      {
        workflow_stage: "visual_creation",
        current_owner: "Visual & Video Agent",
        next_owner: "Crina",
        crina_review_notes: reviewNotes,
        agent_handoff_summary: handoffSummary,
        performance_summary: "Crina reviewed the draft and handed it to Visual & Video Agent."
      },
      "Crina reviewed content draft",
      `${item.title} moved to Visual & Video Agent.`
    );
    current = (await getContentItem(item.id)) ?? current;
  }

  if (current.workflow_stage !== "crina_final_review") {
    const visualResult = await runSubAgent(subAgentConfigs["visual-video"], {
      brand,
      platform: current.platform,
      title: current.title,
      hook: current.hook,
      body: current.body,
      CTA: current.CTA,
      crinaReviewNotes: reviewNotes,
      handoffSummary,
      instruction: "Create the visual, carousel, or video direction required for this content package. No live publishing."
    });
    const visualPatch = mapOutputToPatch("visual-video", visualResult.output);
    fallback = fallback || visualResult.fallback;
    if (visualResult.error) errors.push(visualResult.error);
    const afterVisual = (await getContentItem(item.id)) ?? current;
    const visualAsset = await generateVisualAsset({
      item: afterVisual,
      brand,
      visualDirection: visualPatch.body ?? "",
      copyDraft: afterVisual.body
    });
    if (visualAsset.error && visualAsset.status === "error") errors.push(visualAsset.error);

    await markStage(
      afterVisual,
      {
        workflow_stage: "crina_final_review",
        current_owner: "Crina",
        next_owner: "Human",
        status: "visual",
        approval_status: "not_requested",
        body: packageBody([
          ["COPY DRAFT", afterVisual.body],
          ["VISUAL / VIDEO DIRECTION", visualPatch.body ?? ""]
        ]),
        content_type: visualPatch.content_type ?? afterVisual.content_type,
        visual_asset_url: visualAsset.dataUrl,
        visual_asset_prompt: visualAsset.prompt,
        visual_asset_status: visualAsset.status,
        visual_asset_model: visualAsset.model,
        visual_asset_error: visualAsset.error,
        performance_summary:
          visualAsset.status === "generated"
            ? `${visualResult.agent} finished and generated an image asset with ${visualAsset.model}. With Crina for final review.`
            : visualAsset.status === "placeholder"
              ? `${visualResult.agent} finished creative direction. Image model is not configured, so a local placeholder preview was attached.`
              : `${visualResult.agent} finished creative direction, but image generation failed. Placeholder attached; error: ${visualAsset.error}`,
        agent_handoff_summary: `${visualResult.agent} handed visual direction ${visualAsset.status === "generated" ? "and generated asset" : "and placeholder asset"} back to Crina.`
      },
      "Visual & Video Agent handed package to Crina",
      `${item.title} is with Crina for final review.`
    );
    current = (await getContentItem(item.id)) ?? afterVisual;
  }

  let packageForReview = (await getContentItem(item.id)) ?? current;
  if (!packageForReview.visual_asset_url) {
    const existingVisualDirection = extractVisualDirection(packageForReview.body);
    if (existingVisualDirection) {
      const visualAsset = await generateVisualAsset({
        item: packageForReview,
        brand,
        visualDirection: existingVisualDirection,
        copyDraft: packageForReview.body
      });
      const patchedPackage = await updateContentItem(
        item.id,
        {
          visual_asset_url: visualAsset.dataUrl,
          visual_asset_prompt: visualAsset.prompt,
          visual_asset_status: visualAsset.status,
          visual_asset_model: visualAsset.model,
          visual_asset_error: visualAsset.error,
          performance_summary:
            visualAsset.status === "generated"
              ? `Visual asset generated with ${visualAsset.model}. With Crina for final review.`
              : visualAsset.status === "placeholder"
                ? "Image model is not configured, so a local placeholder preview was attached before final review."
                : `Image generation failed before final review. Placeholder attached; error: ${visualAsset.error}`
        },
        { label: "Visual asset attached", detail: `${item.title} received a visual asset before Crina final review.` }
      );
      packageForReview = patchedPackage ?? packageForReview;
      if (visualAsset.error && visualAsset.status === "error") errors.push(visualAsset.error);
    }
  }

  const finalReview = await crinaReview("final_review", {
    brand,
    contentPackage: {
      title: packageForReview.title,
      hook: packageForReview.hook,
      body: packageForReview.body,
      CTA: packageForReview.CTA,
      platform: packageForReview.platform,
      contentType: packageForReview.content_type
    },
    previousCrinaReview: reviewNotes
  });
  fallback = fallback || finalReview.fallback;
  if (finalReview.error) errors.push(finalReview.error);

  const finalNotes = asString(finalReview.output.reviewNotes);
  const finalSummary = asString(finalReview.output.handoffSummary);

  const updated = await updateContentItem(
    item.id,
    {
      status: "approval",
      approval_status: "pending",
      workflow_stage: "human_final_approval",
      current_owner: "Human",
      next_owner: "Publishing Agent",
      crina_review_notes: finalNotes || reviewNotes,
      agent_handoff_summary: finalSummary || "Crina approved the internal package for human final approval.",
      performance_summary: "Crina completed final review. Waiting for your final approval."
    },
    { label: "Crina sent final package for approval", detail: `${item.title} is ready for human final approval.` }
  );

  const error = errors.filter(Boolean).join(" | ") || null;

  return { ok: Boolean(updated), item: updated, agent: "Crina", provider: fallback ? "deterministic" : "hermes", fallback, error };
}
