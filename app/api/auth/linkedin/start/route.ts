import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAuthorizeUrl, isOrganizationUrn, linkedinConfigured } from "@/lib/social/linkedin";
import { createServiceClient } from "@/lib/supabase/service";

// Operator-initiated LinkedIn OAuth. Admin-only. Stores a state nonce in an httpOnly cookie that
// the callback verifies (CSRF protection).
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  if (!linkedinConfigured()) {
    return NextResponse.json({ error: "LinkedIn is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET." }, { status: 503 });
  }

  const brandId = new URL(request.url).searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id is required." }, { status: 400 });

  // Brands that post as a Company Page also need w_organization_social.
  const { data: brand } = (await createServiceClient()?.from("brands").select("linkedin_organization_urn").eq("id", brandId).maybeSingle()) ?? { data: null };
  const organization = isOrganizationUrn((brand as { linkedin_organization_urn?: string | null } | null)?.linkedin_organization_urn);

  const state = `${brandId}.${randomBytes(16).toString("hex")}`;
  const res = NextResponse.redirect(getAuthorizeUrl(state, { organization }));
  res.cookies.set("li_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  return res;
}
