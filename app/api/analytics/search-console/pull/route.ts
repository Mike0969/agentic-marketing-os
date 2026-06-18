import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSearchPerformanceForBrand } from "@/lib/analytics/search-console";
import { getDashboardData } from "@/lib/data";

export const runtime = "nodejs";

/**
 * Read-only Google Search Console pull, per brand. Each brand uses its own
 * token + site. `?brand=<name>` returns one brand; otherwise all brands.
 * Never writes to Google; never posts.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const brandParam = new URL(request.url).searchParams.get("brand");
  const { brands } = await getDashboardData();
  const targets = brandParam ? brands.filter((b) => b.name === brandParam || b.id === brandParam) : brands;

  const results = await Promise.all(targets.map((brand) => getSearchPerformanceForBrand(brand.name)));
  return NextResponse.json({ brands: results }, { headers: { "x-analytics-mode": "read-only" } });
}
