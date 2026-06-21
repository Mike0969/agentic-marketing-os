import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { updateLocalCampaign } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Campaign, CampaignStatus } from "@/lib/types";

const statuses: CampaignStatus[] = ["planning", "active", "paused", "completed"];
const editable = ["title", "objective", "target_audience", "start_date", "end_date", "brand_id"] as const;

function normalizeStatus(value: unknown): CampaignStatus | null {
  if (value === "draft") return "planning";
  return statuses.includes(value as CampaignStatus) ? (value as CampaignStatus) : null;
}

function cleanPatch(body: Record<string, unknown>): Partial<Campaign> {
  const patch = Object.fromEntries(
    editable
      .filter((field) => typeof body[field] === "string")
      .map((field) => [field, String(body[field]).trim()])
      .filter(([, value]) => value)
  ) as Partial<Campaign>;

  const status = normalizeStatus(body.status);
  if (status) patch.status = status;

  return patch;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const patch = cleanPatch(body);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No editable campaign fields were provided." }, { status: 400 });

  if (!isSupabaseConfigured()) {
    const campaign = await updateLocalCampaign(id, patch);
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    revalidatePath("/marketing/campaigns");
    revalidatePath("/marketing");
    return NextResponse.json({ campaign, mode: "local" });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data, error } = await supabase.from("campaigns").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity").insert(makeActivity("Campaign updated", `${data.title} was updated.`));
  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing");
  return NextResponse.json({ campaign: data as Campaign, mode: "supabase" });
}
