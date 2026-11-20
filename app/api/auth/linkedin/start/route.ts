import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadAppKeys } from "@/lib/social/app-keys";
import { getAuthorizeUrl, isOrganizationUrn, linkedinConfigured } from "@/lib/social/linkedin";
import { backToSettings } from "@/lib/social/oauth-routes";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

// Operator-initiated LinkedIn OAuth. Admin-only. Stores a state nonce in an httpOnly cookie that
// the callback verifies (CSRF protection).
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  await loadAppKeys(); // Settings keys first, then env
  if (!linkedinConfigured()) return backToSettings(request.url, "linkedin", "not_configured");

  const brandId = new URL(request.url).searchParams.get("brand_id");
  if (!brandId) return backToSettings(request.url, "linkedin", "error", "brand");

  // Brands that post as a Company Page also need w_organization_social, so the brand's setting
  // must be read (service client, else the admin's own session). If it cannot be read, refuse
  // rather than start an OAuth flow that may lack the scope.
  const db = createServiceClient() ?? (await createClient());
  if (!db) return backToSettings(request.url, "linkedin", "error", "db_read");
  const { data: brand, error } = await db.from("brands").select("linkedin_organization_urn").eq("id", brandId).maybeSingle();
  if (error) return backToSettings(request.url, "linkedin", "error", "db_read");
  if (!brand) return backToSettings(request.url, "linkedin", "error", "brand");
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
