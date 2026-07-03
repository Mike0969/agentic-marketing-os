import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLoopBottlenecks } from "@/lib/marketing/bottlenecks";

export const dynamic = "force-dynamic";

// P4b — where does the loop spend effort and fail most? Surfaces the next bottleneck to fix.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const bottlenecks = await getLoopBottlenecks();
  return NextResponse.json({ bottlenecks });
}
