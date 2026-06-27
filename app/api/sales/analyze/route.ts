import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAgentAccess } from "@/lib/auth";
import { runConversionAnalysis } from "@/lib/marketing/conversion-agent";

// Agent-triggerable: the Conversion agent estimates the funnel + ranks what converts, then
// writes the learnings back into the brain (closes the loop). Token or admin session.
export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => ({}))) as { brand_id?: string; campaign_id?: string };
  const brandId = body.brand_id?.trim();
  if (!brandId) return NextResponse.json({ error: "brand_id is required." }, { status: 400 });

  const result = await runConversionAnalysis({ brandId, campaignId: body.campaign_id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  revalidatePath("/sales");
  revalidatePath("/");
  return NextResponse.json(result);
}
