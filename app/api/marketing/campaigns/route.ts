import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { createLocalCampaign } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Campaign, CampaignStatus } from "@/lib/types";

const statuses: CampaignStatus[] = ["planning", "active", "paused", "completed"];

function asString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): CampaignStatus {
  if (value === "draft") return "planning";
  return statuses.includes(value as CampaignStatus) ? (value as CampaignStatus) : "planning";
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const input = {
    brand_id: asString(body, "brand_id"),
    title: asString(body, "title"),
    objective: asString(body, "objective"),
    target_audience: asString(body, "target_audience"),
    start_date: asString(body, "start_date"),
    end_date: asString(body, "end_date"),
    status: normalizeStatus(body.status)
  };

  if (!input.brand_id || !input.title || !input.objective || !input.target_audience || !input.start_date || !input.end_date) {
    return NextResponse.json({ error: "Brand, title, objective, audience, start date, and end date are required." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    const campaign = await createLocalCampaign({
      brand_id: input.brand_id,
      title: input.title,
      objective: input.objective,
      target_audience: input.target_audience,
      start_date: input.start_date,
      end_date: input.end_date
    });
    revalidatePath("/marketing/campaigns");
    revalidatePath("/marketing");
    return NextResponse.json({ campaign, mode: "local" }, { status: 201 });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data, error } = await supabase.from("campaigns").insert(input).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity").insert(makeActivity("Campaign created", `${data.title} was created.`));
  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing");
  return NextResponse.json({ campaign: data as Campaign, mode: "supabase" }, { status: 201 });
}
