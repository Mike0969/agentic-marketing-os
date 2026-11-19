import { publishApprovedPackage, reconcileProcessingPosts, socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

function hasLiveSocialConnector(platform: string | null | undefined) {
  const value = (platform ?? "").toLowerCase();
  return value.includes("linkedin") || value === "x" || value.includes("twitter") || value.includes("facebook") || value.includes("instagram") || value.includes("tiktok");
}

// Fire human-approved, scheduled posts when their time arrives. Each post was already approved AND
// given a time by the operator; this just executes at that time. Gated by SOCIAL_POSTING_ENABLED
// (and by a connected account inside publishApprovedPackage). Bounded per run.
const PAGE = 50;

export async function runDuePosts(limit = 5) {
  if (!socialPostingEnabled()) return { posted: 0, attempted: 0, skipped: "posting_off" as const };
  if (!isSupabaseConfigured()) return { posted: 0, attempted: 0, skipped: "no_supabase" as const };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { posted: 0, attempted: 0, skipped: "no_supabase" as const };

  // First settle posts a platform was still processing (TikTok), so they reach a final state.
  const reconciled = await reconcileProcessingPosts().catch(() => ({ checked: 0, published: 0, failed: 0 }));

  // Only items still pending are candidates (filtered in SQL, so processed/unsupported/failed rows
  // can never fill the page). Pages continue past non-social platforms until `limit` are found.
  const nowIso = new Date().toISOString();
  const items: Array<{ id: string; platform: string | null }> = [];
  for (let from = 0; items.length < limit; from += PAGE) {
    const { data: due, error } = await supabase
      .from("content_items")
      .select("id,platform")
      .eq("status", "scheduled")
      .eq("posting_status", "pending")
      .is("archived_at", null)
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { posted: 0, attempted: 0, skipped: "query_error" as const, error: error.message, reconciled };
    const page = (due ?? []) as Array<{ id: string; platform: string | null }>;
    items.push(...page.filter((item) => hasLiveSocialConnector(item.platform)).slice(0, limit - items.length));
    if (page.length < PAGE) break;
  }

  let posted = 0;
  let processing = 0;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of items) {
    // One item's failure (even an unexpected throw) never stops the rest of the batch.
    const res = await publishApprovedPackage(item.id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "publish failed" }));
    if (res.ok && "processing" in res) processing += 1;
    else if (res.ok) posted += 1;
    results.push({ id: item.id, ok: res.ok, error: res.ok ? undefined : res.error });
  }
  return { posted, processing, attempted: items.length, results, reconciled };
}
