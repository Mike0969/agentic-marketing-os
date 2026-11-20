import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { BRAND_COOKIE } from "@/lib/marketing/brand-selection";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST {brandId}: the header switcher; remembers the brand for every page (cookie, 1 year).
 * POST {brandId, makeDefault: true}: Settings → Default brand (brands.is_default) and selects it too.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as { brandId?: unknown; makeDefault?: unknown } | null;
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  if (!UUID_RE.test(brandId)) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const { data: brand } = await db.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  if (body?.makeDefault === true) {
    const off = await db.from("brands").update({ is_default: false }).eq("is_default", true);
    if (off.error) return NextResponse.json({ error: off.error.message }, { status: 500 });
    const on = await db.from("brands").update({ is_default: true }).eq("id", brandId);
    if (on.error) return NextResponse.json({ error: on.error.message }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true, brandId });
  res.cookies.set(BRAND_COOKIE, brandId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: true });
  return res;
}
