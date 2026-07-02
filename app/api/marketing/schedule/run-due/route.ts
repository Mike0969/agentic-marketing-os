import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runDuePosts } from "@/lib/marketing/schedule-runner";

export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const result = await runDuePosts();
  return NextResponse.json({ ok: true, ...result });
}
