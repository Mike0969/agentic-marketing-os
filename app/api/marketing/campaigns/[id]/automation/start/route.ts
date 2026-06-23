import { NextResponse } from "next/server";
import { POST as executeCampaign } from "@/app/api/marketing/campaigns/[id]/execute/route";
import { POST as tickCampaign } from "@/app/api/marketing/campaigns/[id]/orchestrate/route";
import { acquireCampaignAutomationLock, releaseCampaignAutomationLock } from "@/lib/marketing/campaign-automation";

type RouteContext = { params: Promise<{ id: string }> };

async function jsonFrom(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const paramsContext = { params: Promise.resolve({ id }) };
  const lock = await acquireCampaignAutomationLock(id);
  if (!lock.ok) return NextResponse.json({ error: lock.error }, { status: lock.status });

  let executeResponse: Response;
  let executePayload: Record<string, unknown>;

  try {
    executeResponse = await executeCampaign(request, paramsContext);
    executePayload = await jsonFrom(executeResponse);
  } catch (error) {
    await releaseCampaignAutomationLock(id, "needs_attention", { error: error instanceof Error ? error.message : "Campaign automation could not start." });
    throw error;
  }

  if (!executeResponse.ok) {
    await releaseCampaignAutomationLock(id, "needs_attention", {
      error: typeof executePayload.error === "string" ? executePayload.error : "Campaign automation could not start."
    });
    return NextResponse.json(executePayload, { status: executeResponse.status });
  }

  await releaseCampaignAutomationLock(id, "idle");

  const tickResponse = await tickCampaign(new Request(request.url, { method: "POST" }), paramsContext);
  const tickPayload = await jsonFrom(tickResponse);

  return NextResponse.json(
    {
      started: true,
      execute: executePayload,
      tick: tickPayload,
      message: tickPayload.message ?? "Campaign automation started."
    },
    { status: tickResponse.ok ? 200 : tickResponse.status }
  );
}
