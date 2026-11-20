import type { CampaignJob } from "@/lib/marketing/campaign-jobs";
import type { Campaign, ContentItem } from "@/lib/types";

/**
 * One plain sentence + a time for the top of every campaign (admin 2026-11-20: "are the agents
 * working or did they stop? Nothing says it needs me"). Pure (tested).
 */
export type StatusAction = "approve_plan" | "rework_plan" | "start_agents" | "run_again" | "review_posts";
export type StatusLine = { tone: "working" | "needs_you" | "ok" | "stopped"; text: string; at: string | null; actions: StatusAction[] };

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(11, 16) + " UTC" : null);

export function statusLine(campaign: Pick<Campaign, "idea_brief">, posts: Array<Pick<ContentItem, "approval_status" | "workflow_stage" | "platform" | "scheduled_at" | "published_at">>, job: CampaignJob | null, now = Date.now()): StatusLine {
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const stage = String(brief.stage ?? "planning");
  const blocked = (brief.blocked ?? null) as { kind?: string; reason?: string; platform?: string; at?: string } | null;
  const planJev = (brief.plan_jev ?? null) as { score?: number | null; doubts?: string | null } | null;
  const pending = posts.filter((p) => p.approval_status === "pending");
  const inRework = posts.filter((p) => p.workflow_stage === "rework" || p.approval_status === "changes_requested");
  const approved = posts.filter((p) => p.approval_status === "approved");

  if (job?.state === "running" && now - Date.parse(job.started_at) < 20 * 60 * 1000) {
    return { tone: "working", text: `Agents working: ${job.label.toLowerCase()}. You can leave this page; you'll be notified when it's ready.`, at: `started ${hhmm(job.started_at)}`, actions: [] };
  }
  if (stage === "planning") {
    return brief.plan_error
      ? { tone: "stopped", text: `Stopped: Crina could not plan it (${String(brief.plan_error).slice(0, 100)}). Needs you: rework the plan with a note.`, at: null, actions: ["rework_plan"] }
      : { tone: "working", text: "Crina is planning.", at: job ? `started ${hhmm(job.started_at)}` : null, actions: [] };
  }
  if (stage === "plan_doubts") {
    const score = typeof planJev?.score === "number" ? ` (${planJev.score.toFixed(2)})` : "";
    return { tone: "needs_you", text: `Stopped: Jev rejected the plan${score}. Needs you: approve the plan anyway, or rework it with your note.`, at: hhmm(job?.finished_at) , actions: ["approve_plan", "rework_plan"] };
  }
  if (stage === "plan_ready") return { tone: "needs_you", text: "Plan cleared. Needs you: start the agents.", at: null, actions: ["start_agents"] };
  if (pending.length) return { tone: "needs_you", text: `Ready for your review: ${pending.length} post(s) (${pending.map((p) => p.platform).join(", ")}).`, at: hhmm(job?.finished_at), actions: ["review_posts"] };
  if (blocked?.reason) {
    if (blocked.kind === "moved") return { tone: "needs_you", text: `${blocked.reason}`, at: hhmm(blocked.at), actions: ["run_again"] };
    if (blocked.kind === "failed") return { tone: "stopped", text: `Stopped: the agents could not finish${blocked.platform ? ` ${blocked.platform}` : ""}. Needs you: run the agents again.`, at: hhmm(blocked.at), actions: ["run_again"] };
    return { tone: "needs_you", text: `Blocked by safety check${blocked.platform ? ` (${blocked.platform})` : ""}. Needs you: see the flagged sentences below, then rework with a note or edit and approve.`, at: hhmm(blocked.at), actions: [] };
  }
  if (job?.state === "error") return { tone: "stopped", text: `Stopped: ${job.summary ?? "the agents could not finish."}`, at: hhmm(job.finished_at), actions: ["run_again"] };
  if (inRework.length) return { tone: "working", text: `Agents working on your rework (${inRework.length} post(s)).`, at: null, actions: [] };
  if (posts.length && approved.length === posts.length) {
    const published = posts.filter((p) => p.published_at).length;
    return { tone: "ok", text: published ? `Published: ${published} of ${posts.length} post(s).` : "Scheduled: all posts approved.", at: null, actions: [] };
  }
  return { tone: "stopped", text: "Nothing is running. Needs you: run the agents.", at: null, actions: ["run_again"] };
}
