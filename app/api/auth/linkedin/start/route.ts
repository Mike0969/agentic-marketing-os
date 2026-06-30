import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAuthorizeUrl, linkedinConfigured } from "@/lib/social/linkedin";

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

  const state = `${brandId}.${randomBytes(16).toString("hex")}`;
  const res = NextResponse.redirect(getAuthorizeUrl(state));
  res.cookies.set("li_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  return res;
}
