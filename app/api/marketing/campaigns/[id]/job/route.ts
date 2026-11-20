import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getJob } from "@/lib/marketing/campaign-jobs";

/** The campaign's background job (the Review page polls it while the agents work). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  return NextResponse.json({ job: await getJob(id) });
}
