import { publishApprovedPackage, socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

function hasLiveSocialConnector(platform: string | null | undefined) {
  const value = (platform ?? "").toLowerCase();
  return value.includes("linkedin") || value === "x" || value.includes("twitter") || value.includes("facebook") || value.includes("instagram") || value.includes("tiktok");
}

// Fire human-approved, scheduled posts when their time arrives. Each post was already approved AND
// given a time by the operator; this just executes at that time. Gated by SOCIAL_POSTING_ENABLED
// (and by a connected account inside publishApprovedPackage). Bounded per run.
export async function runDuePosts(limit = 5) {
  if (!socialPostingEnabled()) return { posted: 0, attempted: 0, skipped: "posting_off" as const };
  if (!isSupabaseConfigured()) return { posted: 0, attempted: 0, skipped: "no_supabase" as const };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { posted: 0, attempted: 0, skipped: "no_supabase" as const };

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("content_items")
    .select("id,platform")
    .eq("status", "scheduled")
    .is("archived_at", null)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(Math.max(limit * 4, 10));

  const items = ((due ?? []) as Array<{ id: string; platform: string | null }>).filter((item) => hasLiveSocialConnector(item.platform)).slice(0, limit);
  let posted = 0;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of items) {
    const res = await publishApprovedPackage(item.id);
    if (res.ok) posted += 1;
    results.push({ id: item.id, ok: res.ok, error: res.ok ? undefined : res.error });
  }
  return { posted, attempted: items.length, results };
}
