import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { decideLocalApproval } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Approval, ApprovalDecision, ContentItem, ContentStatus } from "@/lib/types";

const decisions: Array<Exclude<ApprovalDecision, "pending">> = ["approved", "rejected", "changes_requested"];

function gateNextStatus(gate: string, decision: Exclude<ApprovalDecision, "pending">): ContentStatus {
  if (decision !== "approved") return "draft";
  return gate === "gate_1" ? "visual" : "scheduled";
}

function approvalStatus(decision: Exclude<ApprovalDecision, "pending">) {
  return decision;
}

export async function POST(request: Request, context: { params: Promise<{ contentItemId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { contentItemId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const decision = body.decision as Exclude<ApprovalDecision, "pending">;
  const gate = typeof body.gate === "string" ? body.gate : "gate_2";
  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
  const requestedByAgent = typeof body.requested_by_agent === "string" ? body.requested_by_agent : "Crina";

  if (!decisions.includes(decision)) {
    return NextResponse.json({ error: "Decision must be approved, rejected, or changes_requested." }, { status: 400 });
  }

  if (decision !== "approved" && !feedback) {
    return NextResponse.json({ error: "A reason is required for rejection or changes requested." }, { status: 400 });
  }

  const nextStatus = gateNextStatus(gate, decision);

  if (!isSupabaseConfigured()) {
    const result = await decideLocalApproval({
      contentItemId,
      decision,
      feedback,
      requestedByAgent,
      nextStatus
    });
    if (!result) return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    revalidatePath("/marketing/approvals");
    revalidatePath("/marketing/pipeline");
    revalidatePath("/marketing");
    return NextResponse.json({ ...result, mode: "local" });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: contentItem, error: contentError } = await supabase
    .from("content_items")
    .update({
      status: nextStatus,
      approval_status: approvalStatus(decision),
      performance_summary:
        decision === "approved"
          ? gate === "gate_1"
            ? "Gate 1 approved. Move to visual production. Live publishing remains disabled."
            : "Gate 2 approved. Move to scheduled draft. Live publishing remains disabled."
          : `Human feedback: ${feedback}`
    })
    .eq("id", contentItemId)
    .select("*")
    .single();

  if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 });

  const { data: existing } = await supabase
    .from("approvals")
    .select("*")
    .eq("content_item_id", contentItemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const approvalPayload = {
    content_item_id: contentItemId,
    requested_by_agent: requestedByAgent,
    decision,
    feedback,
    decided_at: new Date().toISOString()
  };

  const approvalResult = existing
    ? await supabase.from("approvals").update(approvalPayload).eq("id", existing.id).select("*").single()
    : await supabase.from("approvals").insert(approvalPayload).select("*").single();

  if (approvalResult.error) return NextResponse.json({ error: approvalResult.error.message }, { status: 500 });

  await supabase.from("activity").insert(makeActivity("Approval decision recorded", `${contentItem.title} was marked ${decision.replaceAll("_", " ")}.`));

  revalidatePath("/marketing/approvals");
  revalidatePath("/marketing/pipeline");
  revalidatePath("/marketing");
  return NextResponse.json({ contentItem: contentItem as ContentItem, approval: approvalResult.data as Approval, mode: "supabase" });
}
