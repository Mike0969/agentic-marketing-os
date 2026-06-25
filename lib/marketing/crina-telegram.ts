import { send as sendTelegram } from "@/lib/providers/telegram";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem } from "@/lib/types";

type NotificationResult = {
  campaign_id: string;
  campaign_title: string;
  item_count: number;
  sent: boolean;
  error?: string | null;
};

const MAX_TITLE_LENGTH = 110;

function compact(value: string | null | undefined, fallback: string) {
  const text = (value || fallback).trim();
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}...` : text;
}

function readyToPostUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/marketing/ready-to-post`;
}

function campaignMessage(args: {
  brand: Brand | null;
  campaign: Campaign | null;
  items: ContentItem[];
  baseUrl: string;
}) {
  const brandName = args.brand?.name ?? "Marketing OS";
  const campaignTitle = args.campaign?.title ?? "Campaign package";
  const itemLines = args.items
    .slice(0, 8)
    .map((item) => `• ${item.platform}: ${compact(item.ready_package?.title || item.title, "Ready package")}`)
    .join("\n");
  const extra = args.items.length > 8 ? `\n• +${args.items.length - 8} more ready items` : "";

  return [
    `🟢 Crina: ready to review before posting`,
    `${brandName} · ${campaignTitle}`,
    "",
    `${itemLines}${extra}`,
    "",
    `Open: ${readyToPostUrl(args.baseUrl)}`,
    "",
    `No live posting has happened. Final human approval is still required.`
  ].join("\n");
}

export async function sendCrinaReadyToPostPings(args: {
  campaignIds?: string[];
  baseUrl: string;
}): Promise<{ configured: boolean; claimed: number; results: NotificationResult[] }> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    return { configured: false, claimed: 0, results: [] };
  }

  if (!isSupabaseConfigured()) {
    return { configured: true, claimed: 0, results: [] };
  }

  const supabase = createServiceClient();
  if (!supabase) return { configured: true, claimed: 0, results: [] };

  let query = supabase
    .from("content_items")
    .select("*")
    .eq("workflow_stage", "human_final_approval")
    .eq("approval_status", "pending")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (args.campaignIds?.length) {
    query = query.in("campaign_id", args.campaignIds);
  }

  const { data: readyItems, error } = await query;
  if (error || !readyItems?.length) {
    return { configured: true, claimed: 0, results: error ? [{ campaign_id: "unknown", campaign_title: "Ready to Post", item_count: 0, sent: false, error: error.message }] : [] };
  }

  const now = new Date().toISOString();
  const itemIds = readyItems.map((item) => item.id);
  const { data: claimedItems, error: claimError } = await supabase
    .from("content_items")
    .update({ notified_at: now })
    .in("id", itemIds)
    .is("notified_at", null)
    .select("*");

  if (claimError || !claimedItems?.length) {
    return { configured: true, claimed: 0, results: claimError ? [{ campaign_id: "unknown", campaign_title: "Ready to Post", item_count: 0, sent: false, error: claimError.message }] : [] };
  }

  const items = claimedItems as ContentItem[];
  const campaignIds = Array.from(new Set(items.map((item) => item.campaign_id).filter(Boolean)));
  const brandIds = Array.from(new Set(items.map((item) => item.brand_id).filter(Boolean)));

  const [{ data: campaigns }, { data: brands }] = await Promise.all([
    campaignIds.length ? supabase.from("campaigns").select("*").in("id", campaignIds) : Promise.resolve({ data: [] }),
    brandIds.length ? supabase.from("brands").select("*").in("id", brandIds) : Promise.resolve({ data: [] })
  ]);

  const campaignMap = new Map(((campaigns ?? []) as Campaign[]).map((campaign) => [campaign.id, campaign]));
  const brandMap = new Map(((brands ?? []) as Brand[]).map((brand) => [brand.id, brand]));
  const grouped = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = item.campaign_id || "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const results: NotificationResult[] = [];
  for (const [campaignId, campaignItems] of grouped) {
    const campaign = campaignMap.get(campaignId) ?? null;
    const brand = brandMap.get(campaignItems[0]?.brand_id ?? "") ?? null;
    const result = await sendTelegram(chatId, campaignMessage({ brand, campaign, items: campaignItems, baseUrl: args.baseUrl }));
    results.push({
      campaign_id: campaignId,
      campaign_title: campaign?.title ?? "Ready to Post",
      item_count: campaignItems.length,
      sent: result.ok,
      error: result.error
    });
  }

  return { configured: true, claimed: items.length, results };
}
