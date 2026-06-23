import { NextResponse } from "next/server";
import { POST as executeCampaign } from "@/app/api/marketing/campaigns/[id]/execute/route";
import { POST as tickCampaign } from "@/app/api/marketing/campaigns/[id]/orchestrate/route";

type RouteContext = { params: Promise<{ id: string }> };

async function jsonFrom(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function POST(request: Request, context: RouteContext) {
  const executeResponse = await executeCampaign(request, context);
  const executePayload = await jsonFrom(executeResponse);

  if (!executeResponse.ok && executeResponse.status !== 409) {
    return NextResponse.json(executePayload, { status: executeResponse.status });
  }

  const tickResponse = await tickCampaign(new Request(request.url, { method: "POST" }), context);
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
