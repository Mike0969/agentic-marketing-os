import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { decideLocalApproval } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ApprovalDecision } from "@/lib/types";

type ApprovalInput = {
  contentItemId: string;
  decision: Exclude<ApprovalDecision, "pending">;
  feedback: string;
  requestedByAgent: string;
};

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const input = (await request.json()) as ApprovalInput;
  const decidedAt = new Date().toISOString();
  const contentPatch = {
    approval_status: input.decision,
    status: input.decision === "approved" ? "scheduled" : "draft"
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

  return NextResponse.json(result);
}
