import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST {brandId}: move a campaign (and its not-yet-published posts) to another brand. Refused once any
 * of its posts is published or being published. Clears a block from the previous brand, so "Run the
 * agents again" starts clean.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { brandId?: unknown } | null;
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  if (!UUID_RE.test(id) || !UUID_RE.test(brandId)) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const [{ data: campaign }, { data: brand }] = await Promise.all([
    db.from("campaigns").select("id,brand_id,idea_brief").eq("id", id).maybeSingle(),
    db.from("brands").select("id,name").eq("id", brandId).maybeSingle()
  ]);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const { count } = await db
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .or("published_at.not.is.null,posting_status.in.(processing,published)");
  if (count) return NextResponse.json({ error: "A post of this campaign is already published, so its brand can't change." }, { status: 409 });
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const up = await db.from("campaigns").update({ brand_id: brandId, idea_brief: { ...brief, blocked: null } }).eq("id", id);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  const items = await db.from("content_items").update({ brand_id: brandId }).eq("campaign_id", id);
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, brand: brand.name });
}
