import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ProjectAsset, ProjectSlug } from "@/lib/types";

// The Project Asset Library data layer. Crina searches this BEFORE routing to the Visual Agent.

const KNOWN = {
  gridfactory: "11111111-1111-4111-8111-111111111111",
  gulf_el_nexride: "22222222-2222-4222-8222-222222222222"
} as const;

/** Map a brand (by name or seeded id) to its project slug. */
export function resolveProjectSlug(brand: { id?: string | null; name?: string | null } | null | undefined): ProjectSlug | null {
  const name = (brand?.name ?? "").toLowerCase();
  const id = brand?.id ?? "";
  if (name.includes("gridfactory") || id === KNOWN.gridfactory) return "gridfactory";
  if (name.includes("gulf") || name.includes("nexride") || id === KNOWN.gulf_el_nexride) return "gulf_el_nexride";
  return null;
}

export function projectSoulPath(slug: ProjectSlug): string {
  return `hermes-brain/projects/${slug === "gulf_el_nexride" ? "gulf-el-nexride" : "gridfactory"}`;
}

async function db() {
  if (!isSupabaseConfigured()) return null;
  return createServiceClient() ?? (await createClient());
}

export type AssetFilters = {
  projectSlug?: ProjectSlug;
  platform?: string;
  assetType?: string;
  approved?: boolean;
  mandatory?: boolean;
  reuseAllowed?: boolean;
};

export async function listProjectAssets(filters: AssetFilters = {}): Promise<ProjectAsset[]> {
  const supabase = await db();
  if (!supabase) return [];
  let query = supabase.from("project_assets").select("*").order("mandatory", { ascending: false }).order("quality_score", { ascending: false }).order("created_at", { ascending: false });
  if (filters.projectSlug) query = query.eq("project_slug", filters.projectSlug);
  if (filters.assetType) query = query.eq("asset_type", filters.assetType);
  if (typeof filters.approved === "boolean") query = query.eq("approved", filters.approved);
  if (typeof filters.mandatory === "boolean") query = query.eq("mandatory", filters.mandatory);
  if (typeof filters.reuseAllowed === "boolean") query = query.eq("reuse_allowed", filters.reuseAllowed);
  if (filters.platform) query = query.overlaps("platform_fit", [filters.platform.toLowerCase(), "all"]);
  const { data } = await query.limit(200);
  return (data ?? []) as ProjectAsset[];
}

export async function createProjectAsset(input: Partial<ProjectAsset> & { project_slug: ProjectSlug }): Promise<ProjectAsset | null> {
  const supabase = await db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("project_assets")
    .insert({
      project_slug: input.project_slug,
      brand_id: input.brand_id ?? null,
      file_url: input.file_url ?? null,
      asset_type: input.asset_type ?? "image",
      title: input.title ?? "Untitled asset",
      description: input.description ?? null,
      tags: input.tags ?? [],
      platform_fit: input.platform_fit?.length ? input.platform_fit : ["all"],
      content_theme: input.content_theme ?? null,
      visual_style: input.visual_style ?? null,
      quality_score: input.quality_score ?? 0,
      reuse_allowed: input.reuse_allowed ?? true,
      mandatory: input.mandatory ?? false,
      approved: input.approved ?? false,
      source_tool: input.source_tool ?? "manual_upload",
      rights_status: input.rights_status ?? null,
      transcript: input.transcript ?? null,
      extracted_text: input.extracted_text ?? null
    })
    .select("*")
    .single();
  if (error) return null;
  return data as ProjectAsset;
}

export async function updateProjectAsset(id: string, patch: Partial<ProjectAsset>): Promise<ProjectAsset | null> {
  const supabase = await db();
  if (!supabase) return null;
  const { data } = await supabase.from("project_assets").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  return (data as ProjectAsset) ?? null;
}

/**
 * Crina's search: approved assets that fit this platform and respect reuse policy. Never repeat
 * on the same platform; single-use assets are excluded after their first use anywhere.
 */
export async function findAssetCandidates(args: { projectSlug: ProjectSlug; platform: string; limit?: number }): Promise<ProjectAsset[]> {
  const supabase = await db();
  if (!supabase) return [];
  const platform = args.platform.toLowerCase();
  const { data } = await supabase
    .from("project_assets")
    .select("*")
    .eq("project_slug", args.projectSlug)
    .eq("approved", true)
    .overlaps("platform_fit", [platform, "all"])
    .order("mandatory", { ascending: false })
    .order("quality_score", { ascending: false })
    .order("used_count", { ascending: true })
    .limit(24);
  const assets = (data ?? []) as ProjectAsset[];
  if (!assets.length) return [];

  // Enforce reuse policy after ranking:
  // - never repeat the same asset on the same platform
  // - if reuse_allowed=false, use it once total, then exclude it from all future platform searches
  const { data: usages } = await supabase
    .from("project_asset_usages")
    .select("asset_id,platform")
    .in("asset_id", assets.map((a) => a.id));
  const usageByAsset = new Map<string, Array<{ platform: string | null }>>();
  for (const usage of (usages ?? []) as Array<{ asset_id: string; platform: string | null }>) {
    usageByAsset.set(usage.asset_id, [...(usageByAsset.get(usage.asset_id) ?? []), { platform: usage.platform }]);
  }
  return assets
    .filter((asset) => {
      const assetUsages = usageByAsset.get(asset.id) ?? [];
      if (assetUsages.some((usage) => usage.platform === platform)) return false;
      if (!asset.reuse_allowed && assetUsages.length > 0) return false;
      return true;
    })
    .slice(0, args.limit ?? 6);
}

/** Record that an asset was attached to a post; bumps used_count + last_used_at. */
export async function recordAssetUsage(args: { assetId: string; contentItemId?: string | null; campaignId?: string | null; platform?: string | null; reused?: boolean }): Promise<void> {
  const supabase = await db();
  if (!supabase) return;
  await supabase.from("project_asset_usages").insert({
    asset_id: args.assetId,
    content_item_id: args.contentItemId ?? null,
    campaign_id: args.campaignId ?? null,
    platform: args.platform ? args.platform.toLowerCase() : null,
    reused: args.reused ?? false
  });
  const { data: current } = await supabase.from("project_assets").select("used_count").eq("id", args.assetId).maybeSingle();
  await supabase
    .from("project_assets")
    .update({ used_count: ((current?.used_count as number) ?? 0) + 1, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", args.assetId);
}
