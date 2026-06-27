import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type ConversionInsight = {
  insight: string;
  recommendation: string | null;
  hook: string | null;
  platform: string | null;
  paid_conversion_rate: number | null;
};

export type ConversionMemoryContext = { insights: ConversionInsight[] };

type MemoryRow = {
  insight: string | null;
  recommendation: string | null;
  hook: string | null;
  platform: string | null;
  content_type: string | null;
  paid_conversion_rate: number | null;
};

// What-converts insights Crina reads when proposing ideas + generating posts (the loop read-back).
export async function getConversionMemoryContext(scope: {
  brandId: string;
  platform?: string | null;
  contentType?: string | null;
}): Promise<ConversionMemoryContext> {
  if (!isSupabaseConfigured()) return { insights: [] };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { insights: [] };

  const { data, error } = await supabase
    .from("conversion_memory")
    .select("insight,recommendation,hook,platform,content_type,paid_conversion_rate,rank,created_at")
    .eq("brand_id", scope.brandId)
    .order("rank", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return { insights: [] };

  const platform = scope.platform?.toLowerCase();
  const contentType = scope.contentType?.toLowerCase();
  const rows = (data as MemoryRow[]).filter((row) => {
    if (platform && row.platform && row.platform.toLowerCase() !== platform) return false;
    if (contentType && row.content_type && row.content_type.toLowerCase() !== contentType) return false;
    return true;
  });

  return {
    insights: rows.slice(0, 6).map((row) => ({
      insight: row.insight ?? "",
      recommendation: row.recommendation ?? null,
      hook: row.hook ?? null,
      platform: row.platform ?? null,
      paid_conversion_rate: row.paid_conversion_rate ?? null
    }))
  };
}

export function conversionMemoryText(ctx: ConversionMemoryContext): string {
  if (!ctx.insights.length) return "No conversion data yet — no proven winners to bias toward.";
  return ctx.insights
    .map((i, idx) => {
      const rate = i.paid_conversion_rate != null ? ` (paid conv ${(i.paid_conversion_rate * 100).toFixed(1)}%)` : "";
      const rec = i.recommendation ? ` → ${i.recommendation}` : "";
      return `${idx + 1}. ${i.insight}${rec}${rate}`;
    })
    .join("\n");
}

export async function getLatestConversionOutcomes(brandId: string, limit = 50) {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return [];
  const { data } = await supabase
    .from("conversion_outcomes")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
