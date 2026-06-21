import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { appendLocalContentItems } from "@/lib/local-store";
import { updateContentItem } from "@/lib/content-store";
import { recordAgentLearning } from "@/lib/agents/learning-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentItem, GeneratedContentPlanItem } from "@/lib/types";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { items } = (await request.json()) as { items: GeneratedContentPlanItem[] };

  const contentItems = items.map(toContentItem);

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data, error } = await supabase.from("content_items").insert(contentItems).select("*");

      if (!error) {
        await supabase
          .from("activity")
          .insert(makeActivity("Crina created content ideas", `${data?.length ?? contentItems.length} weekly content plan items entered the pipeline as Idea or Brief.`));
        return NextResponse.json({ created: data?.length ?? contentItems.length, items: data ?? contentItems });
      }
    }
  }

  const created = await appendLocalContentItems(contentItems);
  return NextResponse.json({ created: created.length, items: created });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    platform?: string;
    platforms?: string[];
    approval_status?: ContentItem["approval_status"];
    status?: ContentItem["status"];
    workflow_stage?: ContentItem["workflow_stage"];
    current_owner?: string;
    next_owner?: string;
    human_feedback_tags?: string[];
    crina_review_notes?: string;
    agent_handoff_summary?: string;
    performance_summary?: string;
    feedback?: string;
  };
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const patch: Partial<ContentItem> = {};
  if (Array.isArray(body.platforms)) {
    const platforms = body.platforms.map((platform) => platform.trim()).filter(Boolean);
    if (platforms.length) patch.platform = platforms.join(", ");
  }
  if (typeof body.platform === "string" && body.platform.trim()) patch.platform = body.platform.trim();
  if (body.approval_status) patch.approval_status = body.approval_status;
  if (body.status) patch.status = body.status;
  if (body.workflow_stage) patch.workflow_stage = body.workflow_stage;
  if (typeof body.current_owner === "string") patch.current_owner = body.current_owner;
  if (typeof body.next_owner === "string") patch.next_owner = body.next_owner;
  if (Array.isArray(body.human_feedback_tags)) patch.human_feedback_tags = body.human_feedback_tags;
  if (typeof body.crina_review_notes === "string") patch.crina_review_notes = body.crina_review_notes;
  if (typeof body.agent_handoff_summary === "string") patch.agent_handoff_summary = body.agent_handoff_summary;
  if (typeof body.performance_summary === "string") patch.performance_summary = body.performance_summary;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No supported fields provided." }, { status: 400 });

  const item = await updateContentItem(body.id, patch, { label: "Content item updated", detail: "Platform or planning metadata changed by admin." });
  if (!item) return NextResponse.json({ error: "Content item not found." }, { status: 404 });

  if (body.approval_status === "changes_requested" || body.approval_status === "rejected") {
    await recordAgentLearning({
      contentItem: item,
      decision: body.approval_status,
      feedback: body.feedback ?? body.performance_summary ?? "",
      tags: body.human_feedback_tags ?? [],
      source: "plan_decision"
    });
  }

  return NextResponse.json({ item });
}

function toContentItem(item: GeneratedContentPlanItem): ContentItem {
  return {
    id: item.id,
    brand_id: item.brand_id,
    campaign_id: item.campaign_id,
    platform: item.platform,
    content_type: item.content_type,
    title: item.title,
    body: item.body,
    hook: item.hook,
    CTA: item.CTA,
    status: item.status,
    assigned_agent: item.assigned_agent,
    approval_status: "not_requested",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  };
}
