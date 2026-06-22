import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { updateLocalContentItem } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ApprovalStatus, ContentItem, ContentStatus, ContentWorkflowStage } from "@/lib/types";

const statuses: ContentStatus[] = ["idea", "brief", "draft", "visual", "approval", "scheduled", "published", "analyzed"];
const approvalStatuses: ApprovalStatus[] = ["not_requested", "pending", "approved", "rejected", "changes_requested"];
const workflowStages: ContentWorkflowStage[] = [
  "crina_plan_approval",
  "content_creation",
  "crina_content_review",
  "visual_creation",
  "crina_final_review",
  "human_final_approval",
  "publishing_prep",
  "scheduled",
  "rework",
  "done"
];
const editable = ["title", "body", "hook", "CTA", "platform", "content_type", "assigned_agent", "performance_summary", "current_owner", "next_owner"] as const;

function cleanPatch(body: Record<string, unknown>): Partial<ContentItem> {
  const patch = Object.fromEntries(
    editable
      .filter((field) => typeof body[field] === "string")
      .map((field) => [field, String(body[field]).trim()])
  ) as Partial<ContentItem>;

  if (statuses.includes(body.status as ContentStatus)) patch.status = body.status as ContentStatus;
  if (approvalStatuses.includes(body.approval_status as ApprovalStatus)) patch.approval_status = body.approval_status as ApprovalStatus;
  if (workflowStages.includes(body.workflow_stage as ContentWorkflowStage)) patch.workflow_stage = body.workflow_stage as ContentWorkflowStage;

  return patch;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const patch = cleanPatch(body);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No editable content fields were provided." }, { status: 400 });

  if (!isSupabaseConfigured()) {
    const contentItem = await updateLocalContentItem(id, patch, "Content item updated", `${patch.title ?? id} was updated in the pipeline.`);
    if (!contentItem) return NextResponse.json({ error: "Content item not found." }, { status: 404 });
    revalidatePath("/marketing/pipeline");
    revalidatePath("/marketing");
    return NextResponse.json({ contentItem, mode: "local" });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data, error } = await supabase.from("content_items").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity").insert(makeActivity("Content item updated", `${data.title} moved to ${data.status}.`));
  revalidatePath("/marketing/pipeline");
  revalidatePath("/marketing");
  return NextResponse.json({ contentItem: data as ContentItem, mode: "supabase" });
}
