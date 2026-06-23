import { POST as tickCampaign } from "@/app/api/marketing/campaigns/[id]/orchestrate/route";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return tickCampaign(request, context);
}
