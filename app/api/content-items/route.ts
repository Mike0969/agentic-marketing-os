import { NextResponse } from "next/server";
import { appendLocalContentItems } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentItem, GeneratedContentPlanItem } from "@/lib/types";

export async function POST(request: Request) {
  const { items } = (await request.json()) as { items: GeneratedContentPlanItem[] };

  const contentItems = items.map(toContentItem);

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data, error } = await supabase.from("content_items").insert(contentItems).select("*");

      if (!error) {
        return NextResponse.json({ created: data?.length ?? contentItems.length, items: data ?? contentItems });
      }
    }
  }

  const created = await appendLocalContentItems(contentItems);
  return NextResponse.json({ created: created.length, items: created });
}

function toContentItem(item: GeneratedContentPlanItem): ContentItem {
  return {
    id: item.id,
    brand_id: item.brand_id,
    campaign_id: item.campaign_id,
    platform: item.platform,
    content_type: item.content_type,
    title: item.title,
    body: item.body,
    hook: item.hook,
    CTA: item.CTA,
    status: item.status,
    assigned_agent: item.assigned_agent,
    approval_status: "not_requested",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  };
}
