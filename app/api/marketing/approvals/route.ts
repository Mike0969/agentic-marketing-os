import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type ApprovalDecision = "approved" | "rejected";

function summarizeContent(content: unknown) {
  if (!content || typeof content !== "object") return "Queued content";
  const data = content as {
    seo_brief?: { title?: string; summary?: string };
    title?: string;
    summary?: string;
  };
  return [
    data.seo_brief?.title || data.title || "SEO brief",
    data.seo_brief?.summary || data.summary
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 500);
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data, error } = await supabase
    .from("content_queue")
    .select("*")
    .eq("status", "pending_human")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as {
    queue_id?: string;
    decision?: ApprovalDecision;
    reason?: string;
  };

  if (!body.queue_id || (body.decision !== "approved" && body.decision !== "rejected")) {
    return NextResponse.json({ error: "queue_id and decision are required." }, { status: 400 });
  }

  if (body.decision === "rejected" && !body.reason?.trim()) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: item, error: readError } = await supabase
    .from("content_queue")
    .select("*")
    .eq("id", body.queue_id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Queue item not found." }, { status: 404 });

  const nextStatus = body.decision === "approved" ? "approved" : "remade";
  const nextIteration = body.decision === "rejected" ? Number(item.loop_iteration ?? 1) + 1 : Number(item.loop_iteration ?? 1);

  const { error: updateError } = await supabase
    .from("content_queue")
    .update({
      status: nextStatus,
      human_decision: body.decision,
      human_reason: body.reason?.trim() || null,
      loop_iteration: nextIteration,
      updated_at: new Date().toISOString()
    })
    .eq("id", body.queue_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: memoryError } = await supabase.from("feedback_memory").insert({
    agent_id: item.agent_id || "seo-loop",
    content_type: item.type || "seo_brief",
    content_summary: summarizeContent(item.content),
    content_full: item.content,
    decision: body.decision,
    reason: body.reason?.trim() || null,
    decided_by: "human",
    loop_iteration: Number(item.loop_iteration ?? 1)
  });

  if (memoryError) return NextResponse.json({ error: memoryError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
