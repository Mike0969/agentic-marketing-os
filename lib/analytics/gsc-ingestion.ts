import { getSearchPerformanceForBrand } from "@/lib/analytics/search-console";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// T8 — read-only Google Search Console ingestion into the conversion loop. Per brand, pull GSC
// (impressions/clicks/CTR/position/top-queries) and write ONE brand-level conversion_outcomes row
// with source='google_search'. Honest mapping: impressions -> awareness (REAL reach); clicks/CTR/
// queries -> evidence. Lower funnel (signups/investors/capital) stays 0 — never faked from clicks.
// Idempotent per (brand, GSC window): re-pulling the same window replaces, never duplicates.
// An unconnected brand is a clean skip (no row), not an error.

export async function runGscIngestion(args: { brandId?: string } = {}) {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase not configured." };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { ok: false as const, error: "Supabase not available." };

  const { data: brandRows } = args.brandId
    ? await supabase.from("brands").select("id,name").eq("id", args.brandId)
    : await supabase.from("brands").select("id,name");
  const brands = (brandRows ?? []) as Array<{ id: string; name: string }>;

  let ingested = 0;
  const skipped: Array<{ brand: string; reason: string }> = [];

  for (const brand of brands) {
    const gsc = await getSearchPerformanceForBrand(brand.name); // read-only; never throws
    if (!gsc.connected || !gsc.totals || !gsc.range) {
      skipped.push({ brand: brand.name, reason: gsc.reason ?? "not connected" });
      continue;
    }

    const { clicks, impressions, ctr, position } = gsc.totals;
    const topQueries = gsc.rows.slice(0, 10).map((r) => ({
      query: r.keys[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position
    }));

    // Idempotent replace for this brand + GSC window.
    await supabase
      .from("conversion_outcomes")
      .delete()
      .eq("brand_id", brand.id)
      .eq("source", "google_search")
      .eq("period_start", gsc.range.start)
      .eq("period_end", gsc.range.end);

    const { error } = await supabase.from("conversion_outcomes").insert({
      brand_id: brand.id,
      campaign_id: null,
      source: "google_search",
      awareness: Math.round(impressions),
      signups: 0,
      activations: 0,
      paid: 0,
      revenue: 0,
      period_start: gsc.range.start,
      period_end: gsc.range.end,
      recorded_by: "gsc-ingestion",
      notes: `GSC: ${clicks} clicks / ${impressions} impressions, CTR ${(ctr * 100).toFixed(1)}%, avg pos ${position.toFixed(1)}`,
      evidence: { clicks, impressions, ctr, position, site: gsc.site, top_queries: topQueries }
    });

    if (error) {
      skipped.push({ brand: brand.name, reason: error.message });
      continue;
    }
    ingested += 1;
  }

  return { ok: true as const, ingested, skipped };
}
