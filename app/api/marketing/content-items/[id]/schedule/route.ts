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

  // Published posts are read-only — never let a calendar action rewrite publish history.
  const { data: current } = await supabase.from("content_items").select("status").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (current.status === "published") return NextResponse.json({ error: "Published posts are read-only." }, { status: 409 });

  let patch: Record<string, unknown>;
  if (body.action === "remove") {
    // Archive (recoverable) — off the schedule, out of active screens, not destroyed.
    patch = { archived_at: new Date().toISOString(), scheduled_at: null };
  } else {
    const when = body.scheduled_at ? new Date(body.scheduled_at) : null;
    if (!when || Number.isNaN(when.getTime())) return NextResponse.json({ error: "A valid date/time is required." }, { status: 400 });
    patch = { scheduled_at: when.toISOString(), status: "scheduled", workflow_stage: "scheduled", archived_at: null };
  }

  const { data, error } = await supabase.from("content_items").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/marketing/schedule");
  revalidatePath("/marketing/ready-to-post");
  return NextResponse.json({ contentItem: data });
}
