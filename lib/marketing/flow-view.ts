import type { Campaign, ContentItem } from "@/lib/types";

/** Where a campaign in the admin's simple flow is, derived from idea_brief.stage and its posts. */
export type FlowStep = 1 | 2 | 3 | 4 | 5;

export type FlowView = {
  campaign: Campaign;
  step: FlowStep;
  label: string;
  needsApproval: boolean;
  pendingPosts: number;
  jevDoubts: string | null;
};

export const FLOW_STEPS = [
  { step: 1, label: "Your idea" },
  { step: 2, label: "Crina plans · Jev checks" },
  { step: 3, label: "Agents work" },
  { step: 4, label: "Your review" },
  { step: 5, label: "Schedule" }
] as const;

export function isSimpleFlow(campaign: Campaign) {
  return (campaign.idea_brief as Record<string, unknown> | null)?.flow === "simple";
}

export function flowView(campaign: Campaign, items: ContentItem[]): FlowView {
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const stage = String(brief.stage ?? "planning");
  const posts = items.filter((item) => item.campaign_id === campaign.id && !item.archived_at);
  const pendingPosts = posts.filter((item) => item.approval_status === "pending").length;
  const inRework = posts.filter((item) => item.workflow_stage === "rework" || item.approval_status === "changes_requested").length;
  const decided = posts.filter((item) => item.approval_status === "approved").length;
  const planJev = (brief.plan_jev ?? null) as { doubts?: string | null } | null;
  const base = { campaign, pendingPosts, jevDoubts: planJev?.doubts ?? null };

  if (stage === "planning") return { ...base, step: 2, label: brief.plan_error ? `Crina could not plan: ${String(brief.plan_error).slice(0, 80)}` : "Crina is planning", needsApproval: Boolean(brief.plan_error) };
  if (stage === "plan_doubts") return { ...base, step: 2, label: "Jev doubts the plan: your look", needsApproval: true };
  if (stage === "plan_ready") return { ...base, step: 3, label: "Plan cleared: start the agents", needsApproval: true };
  if (pendingPosts) return { ...base, step: 4, label: `${pendingPosts} post(s) ready for your review`, needsApproval: true };
  const blocked = (brief.blocked ?? null) as { reason?: string; kind?: string } | null;
  if (blocked?.reason) return { ...base, step: 3, label: blocked.reason, needsApproval: true };
  if (inRework) return { ...base, step: 3, label: `${inRework} post(s) back with the agents (rework)`, needsApproval: false };
  if (decided && decided === posts.length) return { ...base, step: 5, label: "All approved: in the schedule", needsApproval: false };
  return { ...base, step: 3, label: "Agents working", needsApproval: false };
}
