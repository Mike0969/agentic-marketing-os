import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAgentAccess } from "@/lib/auth";
import { runGscIngestion } from "@/lib/analytics/gsc-ingestion";

// T8 — agent-triggerable read-only GSC ingestion → conversion_outcomes(source='google_search').
// Schedulable on the cron. Never writes to Google, never posts.
export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => ({}))) as { brand_id?: string };
  const result = await runGscIngestion({ brandId: body.brand_id?.trim() || undefined });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  revalidatePath("/sales");
  return NextResponse.json(result);
}
