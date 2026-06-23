import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type FeedbackMemoryContext = {
  approved: Array<{ summary: string; reason: string | null }>;
  rejected: Array<{ summary: string; reason: string | null }>;
};

type FeedbackRow = {
  content_summary: string | null;
  content_full: Record<string, unknown> | null;
  decision: "approved" | "rejected" | "remade";
  reason: string | null;
};

function matchesScope(row: FeedbackRow, scope: { brandId: string; platform?: string | null; contentType?: string | null }) {
  const full = row.content_full ?? {};
  const brandId = typeof full.brand_id === "string" ? full.brand_id : null;
  const platform = typeof full.platform === "string" ? full.platform.toLowerCase() : "";
  const contentType = typeof full.content_type === "string" ? full.content_type.toLowerCase() : "";

  if (brandId && brandId !== scope.brandId) return false;

  const requestedPlatform = scope.platform?.toLowerCase();
  const requestedContentType = scope.contentType?.toLowerCase();

  if (requestedPlatform && platform && platform !== requestedPlatform) return false;
  if (requestedContentType && contentType && contentType !== requestedContentType) return false;
  return true;
}

export async function getFeedbackMemoryContext(scope: { brandId: string; platform?: string | null; contentType?: string | null }): Promise<FeedbackMemoryContext> {
  if (!isSupabaseConfigured()) return { approved: [], rejected: [] };

  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { approved: [], rejected: [] };

  const { data, error } = await supabase
    .from("feedback_memory")
    .select("content_summary,content_full,decision,reason")
    .eq("decided_by", "human")
    .in("decision", ["approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { approved: [], rejected: [] };

  const rows = ((data ?? []) as FeedbackRow[]).filter((row) => matchesScope(row, scope));
  return {
    approved: rows
      .filter((row) => row.decision === "approved")
      .slice(0, 5)
      .map((row) => ({ summary: row.content_summary ?? "Approved package", reason: row.reason })),
    rejected: rows
      .filter((row) => row.decision === "rejected")
      .slice(0, 5)
      .map((row) => ({ summary: row.content_summary ?? "Rejected package", reason: row.reason }))
  };
}
