import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { JOB_STALE_MS, getJob, startCampaignJob } from "@/lib/marketing/campaign-jobs";
import { prepareAndRun } from "@/lib/marketing/start-agents-server";

export const runtime = "nodejs";

/** "Start the agents" in the background: answers at once; Mihai is notified when the posts are ready. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const running = await getJob(id);
  if (running?.state === "running" && Date.now() - Date.parse(running.started_at) < JOB_STALE_MS) {
    return NextResponse.json({ error: "The agents are already working on this campaign. You'll be notified when it's ready." }, { status: 409 });
  }
  const job = await startCampaignJob({ campaignId: id, kind: "run", label: "Start the agents", origin: request.url, work: () => prepareAndRun(id, request.url) });
  return NextResponse.json({ background: true, job }, { status: 202 });
}
