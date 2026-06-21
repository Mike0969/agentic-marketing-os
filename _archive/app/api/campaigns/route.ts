import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { createLocalCampaign } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types";

type CampaignInput = Omit<Campaign, "id" | "status">;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const input = (await request.json()) as CampaignInput;
  const payload = {
    brand_id: input.brand_id,
    title: input.title,
    objective: input.objective,
    target_audience: input.target_audience,
    start_date: input.start_date,
    end_date: input.end_date,
    status: "planning" as const
  };

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data, error } = await supabase.from("campaigns").insert(payload).select("*").single();

      if (!error && data) {
        await supabase.from("activity").insert(makeActivity("Campaign created", `${data.title} was created.`));
        return NextResponse.json({ campaign: data });
      }
    }
  }

  const campaign = await createLocalCampaign(input);
  return NextResponse.json({ campaign });
}
