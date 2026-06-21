import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { decideLocalApproval, updateLocalContentItem } from "@/lib/local-store";
import { getContentItem } from "@/lib/content-store";
import { recordAgentLearning } from "@/lib/agents/learning-store";
import { suggestPostTimes, type MarketKey } from "@/lib/scheduling/post-timing";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ApprovalDecision } from "@/lib/types";

type ApprovalInput = {
  contentItemId: string;
  decision: Exclude<ApprovalDecision, "pending">;
  feedback: string;
  requestedByAgent: string;
  feedbackTags?: string[];
};

function deriveMarket(brandName: string | undefined): MarketKey {
  const name = (brandName ?? "").toLowerCase();
  if (name.includes("gulf") || name.includes("nexride")) return "gcc";
  return "global";
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const input = (await request.json()) as ApprovalInput;
  const decidedAt = new Date().toISOString();
  const originalItem = await getContentItem(input.contentItemId);

  // On approval, attach a market-aware SUGGESTED post time. This never posts —
  // scheduled_at is a proposal for manual publishing.
  let suggestedAt: string | null = null;
  if (input.decision === "approved") {
    const item = originalItem;
    if (item) {
      const { getDashboardData } = await import("@/lib/data");
      const data = await getDashboardData();
      const brand = data.brands.find((b) => b.id === item.brand_id);
      suggestedAt = suggestPostTimes(deriveMarket(brand?.name), [item.platform])[0]?.isoUtc ?? null;
    }
  }

  const contentPatch = {
    approval_status: input.decision,
    status: input.decision === "approved" ? "scheduled" : "draft",
    workflow_stage: input.decision === "approved" ? "publishing_prep" : "rework",
    current_owner: input.decision === "approved" ? "Publishing Agent" : "Crina",
    next_owner: input.decision === "approved" ? "Human / manual posting" : "Content Creator Agent",
    human_feedback_tags: input.feedbackTags ?? [],
    performance_summary:
      input.decision === "approved"
        ? "Human approved Crina final package. Publishing Agent should prepare the manual draft package. Live posting remains disabled."
        : "Human requested changes. Crina should route the feedback back through the agent chain.",
    ...(input.decision === "approved" && suggestedAt ? { scheduled_at: suggestedAt } : {})
  };

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      let { data: contentItem, error: contentError } = await supabase
        .from("content_items")
        .update(contentPatch)
        .eq("id", input.contentItemId)
        .select("*")
        .single();

      if (contentError?.code === "PGRST204" || contentError?.message?.includes("workflow_stage")) {
        const { workflow_stage, current_owner, next_owner, human_feedback_tags, ...safePatch } = contentPatch;
        const retry = await supabase.from("content_items").update(safePatch).eq("id", input.contentItemId).select("*").single();
        contentItem = retry.data;
        contentError = retry.error;
      }

      if (!contentError && contentItem) {
        const { data: existingApproval } = await supabase.from("approvals").select("id").eq("content_item_id", input.contentItemId).maybeSingle();
        const approvalPayload = {
          content_item_id: input.contentItemId,
          requested_by_agent: input.requestedByAgent,
          decision: input.decision,
          feedback: input.feedback,
          decided_at: decidedAt
        };
        const approvalWrite = existingApproval?.id
          ? await supabase.from("approvals").update(approvalPayload).eq("id", existingApproval.id).select("*").single()
          : await supabase.from("approvals").insert(approvalPayload).select("*").single();

        if (!approvalWrite.error) {
          if (input.decision !== "approved" && contentItem) {
            await recordAgentLearning({
              contentItem: contentItem as never,
              decision: input.decision,
              feedback: input.feedback,
              tags: input.feedbackTags ?? [],
              source: "final_approval"
            });
          }

          await supabase
            .from("activity")
            .insert(makeActivity("Approval decision recorded", `${contentItem.title} was marked ${input.decision.replaceAll("_", " ")}.`));

          return NextResponse.json({ contentItem, approval: approvalWrite.data });
        }
      }
    }
  }

  const result = await decideLocalApproval(input);

  if (!result) {
    return NextResponse.json({ error: "Content item not found" }, { status: 404 });
  }

  if (input.decision === "approved" && suggestedAt) {
    const patched = await updateLocalContentItem(input.contentItemId, { scheduled_at: suggestedAt });
    if (patched) result.contentItem = patched;
  }

  if (input.decision !== "approved" && result.contentItem) {
    await recordAgentLearning({
      contentItem: result.contentItem,
      decision: input.decision,
      feedback: input.feedback,
      tags: input.feedbackTags ?? [],
      source: "final_approval"
    });
  }

  return NextResponse.json(result);
}
