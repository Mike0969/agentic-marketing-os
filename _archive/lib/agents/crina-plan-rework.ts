import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runHermesAgent } from "@/lib/agents/hermes-client";
import { getContentItem, updateContentItem } from "@/lib/content-store";
import { getDashboardData } from "@/lib/data";
import type { ContentItem } from "@/lib/types";

type ReworkInput = {
  contentItemId: string;
  feedback: string;
  feedbackTags: string[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildFallback(item: ContentItem, input: ReworkInput) {
  const tags = input.feedbackTags.length ? input.feedbackTags.join(", ") : "general improvement";
  return {
    title: `Revised: ${item.title}`,
    hook: item.hook,
    body: [item.body, `Crina revision guidance: address ${tags}.`, input.feedback ? `Human feedback: ${input.feedback}` : ""].filter(Boolean).join("\n\n"),
    CTA: item.CTA,
    platform: item.platform,
    content_type: item.content_type,
    assigned_agent: item.assigned_agent,
    revisionNotes: "Deterministic fallback revision. Hermes was unavailable; human should inspect before approving."
  };
}

function normalizePlan(raw: unknown, item: ContentItem, input: ReworkInput) {
  const output = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallback = buildFallback(item, input);
  return {
    title: text(output.title) || fallback.title,
    hook: text(output.hook) || fallback.hook,
    body: text(output.body) || fallback.body,
    CTA: text(output.CTA) || text(output.cta) || fallback.CTA,
    platform: text(output.platform) || fallback.platform,
    content_type: text(output.content_type) || text(output.contentType) || fallback.content_type,
    assigned_agent: text(output.assigned_agent) || text(output.assignedAgent) || fallback.assigned_agent,
    revisionNotes: text(output.revisionNotes) || text(output.revision_notes) || fallback.revisionNotes
  };
}

export async function reworkCrinaPlan(input: ReworkInput) {
  const item = await getContentItem(input.contentItemId);
  if (!item) return { ok: false, item: null, provider: "deterministic", fallback: true, error: "Content item not found." };

  const data = await getDashboardData();
  const brand = data.brands.find((candidate) => candidate.id === item.brand_id);

  await updateContentItem(
    item.id,
    {
      workflow_stage: "rework",
      current_owner: "Crina",
      next_owner: "Human",
      status: "brief",
      approval_status: "changes_requested",
      human_feedback_tags: input.feedbackTags,
      performance_summary: "Crina is revising this plan from your feedback."
    },
    { label: "Crina started plan revision", detail: `${item.title} is being revised from human feedback.` }
  );

  const startedAt = Date.now();
  const result = await runHermesAgent({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Revise Content Plan From Human Feedback",
    instructions:
      "Revise this Crina plan idea based on the human's feedback and reason tags. Keep it as a plan proposal, not a final post. Return a sharper plan that can be approved for production. Never publish.",
    outputSchema: {
      title: "string",
      hook: "string",
      body: "string",
      CTA: "string",
      platform: "string",
      content_type: "string",
      assigned_agent: "Content Creator Agent | SEO Agent | Visual & Video Agent | Competitor Intelligence Agent",
      revisionNotes: "string"
    },
    input: {
      brand,
      originalPlan: {
        title: item.title,
        hook: item.hook,
        body: item.body,
        CTA: item.CTA,
        platform: item.platform,
        content_type: item.content_type,
        assigned_agent: item.assigned_agent
      },
      humanFeedback: input.feedback,
      feedbackTags: input.feedbackTags
    },
    brainFiles: ["brand-briefs.md", "brand-voice.md", "approval-rules.md", "weak-hooks.md", "agent-crina-memory.md"],
    handoffFrom: "Human Plan Decision",
    handoffTo: "Approval Queue"
  });

  const revised = normalizePlan(result.ok ? result.json : null, item, input);
  const updated = await updateContentItem(
    item.id,
    {
      title: revised.title,
      hook: revised.hook,
      body: revised.body,
      CTA: revised.CTA,
      platform: revised.platform,
      content_type: revised.content_type,
      assigned_agent: revised.assigned_agent,
      status: "brief",
      approval_status: "not_requested",
      workflow_stage: "crina_plan_approval",
      current_owner: "Human",
      next_owner: "Crina",
      crina_review_notes: revised.revisionNotes,
      agent_handoff_summary: "Crina revised the plan from human feedback and returned it for plan decision.",
      performance_summary: result.ok ? "Crina revised this plan. Waiting for your decision." : "Crina revision used deterministic fallback. Waiting for your decision."
    },
    { label: "Crina revised plan", detail: `${revised.title} returned to plan decisions.` }
  );

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Revise Content Plan From Human Feedback",
    provider: result.ok ? "hermes" : "deterministic",
    status: result.ok ? "success" : "fallback",
    input: { contentItemId: input.contentItemId, feedback: input.feedback, feedbackTags: input.feedbackTags },
    output: revised,
    error: result.error,
    model: result.modelUsed,
    backupModel: result.backupModel,
    tokensPrompt: result.usage.tokensPrompt,
    tokensCompletion: result.usage.tokensCompletion,
    tokensTotal: result.usage.tokensTotal,
    durationMs: result.ok ? result.durationMs : Date.now() - startedAt,
    brainResourcesUsed: result.brainResourcesUsed,
    handoffFrom: "Human Plan Decision",
    handoffTo: "Approval Queue",
    providerResponseStatus: result.status
  });

  return { ok: Boolean(updated), item: updated, provider: result.ok ? "hermes" : "deterministic", fallback: !result.ok, error: result.error };
}
