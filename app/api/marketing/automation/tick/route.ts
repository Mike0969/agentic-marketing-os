import { NextResponse } from "next/server";
import { POST as tickCampaign } from "@/app/api/marketing/campaigns/[id]/automation/tick/route";
import { requireAgentAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Campaign, ContentItem } from "@/lib/types";

async function jsonFrom(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ processed: 0, results: [], message: "Local fallback mode does not run global automation ticks." });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase service client is not configured." }, { status: 503 });

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .order("automation_last_tick_at", { ascending: true, nullsFirst: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blockedStatuses = new Set(["paused", "needs_attention", "waiting_human", "publishing_prep", "complete"]);
  const candidates = ((campaigns ?? []) as Campaign[]).filter((campaign) => !blockedStatuses.has(campaign.automation_status ?? "idle")).slice(0, 5);
  if (!candidates.length) return NextResponse.json({ processed: 0, results: [], message: "No campaigns are eligible for automation." });

  const campaignIds = candidates.map((campaign) => campaign.id);
  const { data: contentItems } = await supabase.from("content_items").select("id,campaign_id").in("campaign_id", campaignIds);
  const seededIds = new Set(((contentItems ?? []) as Pick<ContentItem, "id" | "campaign_id">[]).map((item) => item.campaign_id));
  const seededCampaigns = candidates.filter((campaign) => seededIds.has(campaign.id)).slice(0, 3);

  const results = [];
  for (const campaign of seededCampaigns) {
    const tickRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers
    });
    const response = await tickCampaign(tickRequest, { params: Promise.resolve({ id: campaign.id }) });
    results.push({
      campaign_id: campaign.id,
      campaign_title: campaign.title,
      ok: response.ok,
      status: response.status,
      payload: await jsonFrom(response)
    });
  }

  return NextResponse.json({
    processed: results.length,
    skipped_unseeded: candidates.length - seededCampaigns.length,
    results
  });
}
