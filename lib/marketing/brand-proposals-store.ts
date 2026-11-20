import { isProposableField, type BrandProposals } from "@/lib/marketing/brand-proposals";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** Open proposals per brand, for Brands. Never passed to agents. */
export async function listOpenBrandProposals(): Promise<BrandProposals> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  if (!supabase) return {};
  const { data, error } = await supabase.from("brand_field_proposals").select("brand_id, field, value, source").eq("status", "proposed");
  if (error || !data) return {};
  const result: BrandProposals = {};
  for (const row of data as Array<{ brand_id: string; field: string; value: string; source: string }>) {
    if (!isProposableField(row.field)) continue;
    (result[row.brand_id] ??= {})[row.field] = { value: row.value, source: row.source };
  }
  return result;
}
