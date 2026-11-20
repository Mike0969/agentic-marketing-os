import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { notifyOperator } from "@/lib/marketing/notify";

// Called by the login page right after a successful sign-in (fire-and-forget, so it never blocks the
// login). Admin-only: the email named in the alert is the admin session's own.
export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  await notifyOperator(`🔐 ${admin.email ?? "the local operator"} logged in to the platform`);
  return NextResponse.json({ ok: true });
}
