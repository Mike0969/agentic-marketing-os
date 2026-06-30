import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Schedule actions from the calendar: set/move a post's time, or remove it from the schedule
// (back to draft — recoverable, in case the operator changes their mind). Admin-only. No posting.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; scheduled_at?: string };

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not available." }, { status: 503 });

  let patch: Record<string, unknown>;
  if (body.action === "remove") {
    patch = { scheduled_at: null, status: "draft", workflow_stage: "rework", current_owner: "Crina", next_owner: "Crina" };
  } else {
    const when = body.scheduled_at ? new Date(body.scheduled_at) : null;
    if (!when || Number.isNaN(when.getTime())) return NextResponse.json({ error: "A valid date/time is required." }, { status: 400 });
    patch = { scheduled_at: when.toISOString(), status: "scheduled", workflow_stage: "scheduled" };
  }

  const { data, error } = await supabase.from("content_items").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/marketing/schedule");
  revalidatePath("/marketing/ready-to-post");
  return NextResponse.json({ contentItem: data });
}
