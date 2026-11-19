import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAuthorizeUrl, isOrganizationUrn, linkedinConfigured } from "@/lib/social/linkedin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

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

  // Brands that post as a Company Page also need w_organization_social, so the brand's setting
  // must be read (service client, else the admin's own session). If it cannot be read, refuse
  // rather than start an OAuth flow that may lack the scope.
  const db = createServiceClient() ?? (await createClient());
  if (!db) return NextResponse.json({ error: "Cannot read the brand's LinkedIn settings: the database is not configured." }, { status: 503 });
  const { data: brand, error } = await db.from("brands").select("linkedin_organization_urn").eq("id", brandId).maybeSingle();
  if (error) return NextResponse.json({ error: `Cannot read the brand's LinkedIn settings: ${error.message}` }, { status: 503 });
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  const organization = isOrganizationUrn((brand as { linkedin_organization_urn?: string | null }).linkedin_organization_urn);

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
