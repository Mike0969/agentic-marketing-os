import { withCampaignBudget } from "@/lib/budget/model-budget";
import { runOutcome, type JobOutcome } from "@/lib/marketing/campaign-jobs";
import { prepareSupportAgents, type CampaignPlan } from "@/lib/marketing/simple-flow";
import { createServiceClient } from "@/lib/supabase/service";
import type { Brand } from "@/lib/types";

/**
 * Server side of "Start the agents" (no browser needed): the plan must be cleared; the SEO and
 * measurement notes come from the plan; then the content + visual run. Used inside a background job.
 */
export async function prepareAndRun(campaignId: string, requestUrl: string): Promise<JobOutcome> {
  const supabase = createServiceClient();
  if (!supabase) return { state: "error", summary: "The database is not available." };
  const { data: row } = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  const campaign = row as { id: string; brand_id: string; objective?: string | null; idea_brief?: Record<string, unknown> | null } | null;
  if (!campaign) return { state: "error", summary: "Campaign not found." };
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const plan = (brief.plan ?? null) as CampaignPlan | null;
  if (!plan || (brief.stage !== "plan_ready" && brief.stage !== "agents")) {
    return { state: "needs_you", summary: "the plan is not cleared yet: open it and approve or rework the plan." };
  }
  if (brief.stage === "plan_ready") {
    const { data: brandRow } = await supabase.from("brands").select("*").eq("id", campaign.brand_id).maybeSingle();
    const support = await prepareSupportAgents({ idea: String(brief.idea ?? campaign.objective ?? ""), brand: brandRow as Brand | null, plan });
    const { data: fresh } = await supabase.from("campaigns").select("idea_brief").eq("id", campaignId).maybeSingle();
    const current = ((fresh as { idea_brief?: Record<string, unknown> } | null)?.idea_brief ?? brief) as Record<string, unknown>;
    await supabase.from("campaigns").update({ status: "active", idea_brief: { ...current, ...support, stage: "agents" } }).eq("id", campaignId);
  }
  const { POST: runPost } = await import("@/app/api/marketing/campaigns/[id]/run/route");
  const res = await withCampaignBudget(campaignId, () =>
    runPost(new Request(new URL(`/api/marketing/campaigns/${campaignId}/run`, requestUrl), { method: "POST", headers: { authorization: `Bearer ${process.env.AGENT_TRIGGER_TOKEN ?? ""}`, "content-type": "application/json" }, body: "{}" }), {
      params: Promise.resolve({ id: campaignId })
    })
  );
  return runOutcome(res.status, (await res.json().catch(() => ({}))) as Parameters<typeof runOutcome>[1]);
}
