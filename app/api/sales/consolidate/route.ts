import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAgentAccess } from "@/lib/auth";
import { runMemoryConsolidation } from "@/lib/marketing/memory-consolidation";

// L4 Editor pass — re-distils the conversion memory + Hermes brain into a sharp ranked playbook.
// Agent-triggerable (token or admin) so it can run on a schedule.
export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => ({}))) as { brand_id?: string };
  const result = await runMemoryConsolidation({ brandId: body.brand_id?.trim() || undefined });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  revalidatePath("/sales");
  return NextResponse.json(result);
}
