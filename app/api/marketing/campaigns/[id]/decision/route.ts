import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Operator decision on a proposed campaign idea:
//  - select : hand it to the autonomous loop (no stages, no manual delegation)
//  - archive: tuck it away (can run later)
//  - update : save the operator's edits to the idea (their angle/notes/platforms)
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    title?: string;
    objective?: string;
    idea_brief?: Record<string, unknown>;
  };

  if (!["select", "archive", "update"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "action must be 'select', 'archive', or 'update'." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  let patch: Record<string, unknown>;
  if (body.action === "select") {
    patch = { status: "active", selected_at: new Date().toISOString(), automation_status: "running" };
  } else if (body.action === "archive") {
    patch = { status: "archived", archived_at: new Date().toISOString() };
  } else {
    patch = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.objective === "string") patch.objective = body.objective.trim();
    if (body.idea_brief && typeof body.idea_brief === "object") patch.idea_brief = body.idea_brief;
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase.from("campaigns").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing");
  revalidatePath("/marketing/pipeline");
  return NextResponse.json({ campaign: data });
}
