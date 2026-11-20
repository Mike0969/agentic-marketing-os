import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Pause / resume the 2-minute automation cron for one campaign. Paused campaigns are
 * skipped by the cron (no agent work, no model calls); Resume hands them back to it.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "pause" && action !== "resume") return NextResponse.json({ error: "Action must be pause or resume." }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });
  const { data, error } = await supabase
    .from("campaigns")
    .update({ automation_status: action === "pause" ? "paused" : "idle" })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  await supabase.from("activity").insert(makeActivity(action === "pause" ? "Campaign automation paused" : "Campaign automation resumed", `${data.title}: ${action === "pause" ? "the agents stop working on it" : "the agents pick it up again"}.`));
  revalidatePath("/marketing/campaigns");
  return NextResponse.json({ campaign: data });
}
