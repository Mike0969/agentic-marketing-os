import { NextResponse } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { getLatestTeamReport } from "@/lib/agents/team-runner";

export const runtime = "nodejs";

/**
 * Latest persisted team report as data/outputs for Hermes to announce/send on
 * Slack. Callable by an admin session OR the AGENT_TRIGGER_TOKEN bearer.
 */
export async function GET(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const report = await getLatestTeamReport();

  if (!report) {
    return NextResponse.json({ error: "No team report has been generated yet.", report: null }, { status: 404 });
  }

  return NextResponse.json(report, { headers: { "x-live-posting": "disabled" } });
}
