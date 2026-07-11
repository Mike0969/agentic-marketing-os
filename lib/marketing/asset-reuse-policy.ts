// The inspiration-library reuse policy, isolated as a pure, dependency-free
// function so it is unit-testable and shared by both the cloud and local backends.
//
// Operator rule (same as the Supabase library): never use the same asset twice on
// the SAME platform; a single-use asset (reuse_allowed=false) may be used once total
// and is then excluded everywhere. Ranking: mandatory first, then higher quality,
// then least-used (so the library rotates instead of hammering one asset).

export interface AssetLike {
  id: string;
  mandatory: boolean;
  quality_score: number;
  used_count: number;
  reuse_allowed: boolean;
}

export interface UsageLike {
  asset_id: string;
  platform: string | null;
}

export function selectAssetCandidates<T extends AssetLike>(assets: T[], usages: UsageLike[], platform: string, limit = 6): T[] {
  const p = platform.toLowerCase();
  const usageByAsset = new Map<string, UsageLike[]>();
  for (const u of usages) usageByAsset.set(u.asset_id, [...(usageByAsset.get(u.asset_id) ?? []), u]);

  const ranked = [...assets].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    return (a.used_count ?? 0) - (b.used_count ?? 0);
  });

  return ranked
    .filter((asset) => {
      const u = usageByAsset.get(asset.id) ?? [];
      if (u.some((usage) => (usage.platform ?? "").toLowerCase() === p)) return false; // never same platform twice
      if (!asset.reuse_allowed && u.length > 0) return false; // single-use: once total
      return true;
    })
    .slice(0, limit);
}
