import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { decideLocalApproval, updateLocalContentItem } from "@/lib/local-store";
import { getContentItem } from "@/lib/content-store";
import { suggestPostTimes, type MarketKey } from "@/lib/scheduling/post-timing";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ApprovalDecision } from "@/lib/types";

type ApprovalInput = {
  contentItemId: string;
  decision: Exclude<ApprovalDecision, "pending">;
  feedback: string;
  requestedByAgent: string;
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

  // On approval, attach a market-aware SUGGESTED post time. This never posts —
  // scheduled_at is a proposal for manual publishing.
  let suggestedAt: string | null = null;
  if (input.decision === "approved") {
    const item = await getContentItem(input.contentItemId);
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
    ...(input.decision === "approved" && suggestedAt ? { scheduled_at: suggestedAt } : {})
  };

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data: contentItem, error: contentError } = await supabase
        .from("content_items")
        .update(contentPatch)
        .eq("id", input.contentItemId)
        .select("*")
        .single();

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

  return NextResponse.json(result);
}
