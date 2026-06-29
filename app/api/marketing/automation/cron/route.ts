import { NextResponse } from "next/server";
import { POST as tickCampaign } from "@/app/api/marketing/campaigns/[id]/automation/tick/route";
import { runGscIngestion } from "@/lib/analytics/gsc-ingestion";
import { requireAgentAccess } from "@/lib/auth";
import { sendCrinaReadyToPostPings } from "@/lib/marketing/crina-telegram";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Campaign, ContentItem } from "@/lib/types";

const GSC_REFRESH_MS = 12 * 60 * 60 * 1000; // refresh Google Search data at most ~twice a day

// Best-effort, idempotent GSC refresh on the cron. GSC data lags 2-3 days, so a tight cadence adds
// nothing; this also keeps us well under Search Console API quota. Never throws.
async function refreshGscIfStale(supabase: NonNullable<ReturnType<typeof createServiceClient>>) {
  try {
    const { data: recent } = await supabase
      .from("conversion_outcomes")
      .select("created_at")
      .eq("source", "google_search")
      .order("created_at", { ascending: false })
      .limit(1);
    const last = recent?.[0]?.created_at ? new Date(recent[0].created_at as string).getTime() : 0;
    if (Date.now() - last < GSC_REFRESH_MS) return { skipped: "recent" as const };
    return await runGscIngestion();
  } catch {
    return { skipped: "error" as const };
  }
}

async function jsonFrom(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function baseUrlFrom(request: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(request.url).origin;
}

function hasEligibleInternalStep(item: ContentItem) {
  if (item.workflow_stage === "human_final_approval" || item.workflow_stage === "publishing_prep" || item.workflow_stage === "scheduled") return false;
  if (item.approval_status === "pending" || item.status === "scheduled" || item.status === "published") return false;
  return (
    item.status === "idea" ||
    item.status === "brief" ||
    item.status === "visual" ||
    item.workflow_stage === "content_creation" ||
    item.workflow_stage === "crina_content_review" ||
    item.workflow_stage === "visual_creation" ||
    item.workflow_stage === "crina_final_review" ||
    (item.status === "draft" && (item.current_owner === "Crina" || item.next_owner === "Visual & Video Agent"))
  );
}

async function runCron(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      processed: 0,
      notifications: { configured: false, claimed: 0, results: [] },
      message: "Local fallback mode does not run global automation cron."
    });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase service client is not configured." }, { status: 503 });

  const gscIngestion = await refreshGscIfStale(supabase);

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .order("automation_last_tick_at", { ascending: true, nullsFirst: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blockedStatuses = new Set(["paused", "needs_attention", "waiting_human", "publishing_prep", "complete"]);
  const activeCampaigns = ((campaigns ?? []) as Campaign[]).filter((campaign) => !blockedStatuses.has(campaign.automation_status ?? "idle"));
  const activeCampaignIds = activeCampaigns.map((campaign) => campaign.id);

  if (!activeCampaignIds.length) {
    const notifications = await sendCrinaReadyToPostPings({ baseUrl: baseUrlFrom(request) });
    return NextResponse.json({ processed: 0, results: [], notifications, gsc_ingestion: gscIngestion, message: "No campaigns are eligible for automation." });
  }

  const { data: contentItems, error: contentError } = await supabase
    .from("content_items")
    .select("*")
    .in("campaign_id", activeCampaignIds);

  if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 });

  const itemsByCampaign = new Map<string, ContentItem[]>();
  for (const item of (contentItems ?? []) as ContentItem[]) {
    itemsByCampaign.set(item.campaign_id, [...(itemsByCampaign.get(item.campaign_id) ?? []), item]);
  }

  const candidates = activeCampaigns
    .filter((campaign) => (itemsByCampaign.get(campaign.id) ?? []).some(hasEligibleInternalStep))
    .slice(0, 3);

  const results = [];
  for (const campaign of candidates) {
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

  const touchedCampaignIds = Array.from(new Set([...activeCampaignIds, ...results.map((result) => result.campaign_id)]));
  const notifications = await sendCrinaReadyToPostPings({ campaignIds: touchedCampaignIds, baseUrl: baseUrlFrom(request) });

  return NextResponse.json({
    processed: results.length,
    skipped_no_internal_step: activeCampaigns.length - candidates.length,
    results,
    notifications,
    gsc_ingestion: gscIngestion
  });
}

export async function POST(request: Request) {
  return runCron(request);
}

export async function GET(request: Request) {
  return runCron(request);
}
