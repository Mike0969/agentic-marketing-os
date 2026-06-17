import { NextResponse } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { runTeam, type TeamRunInput } from "@/lib/agents/team-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Trigger a parallel team run (fan-out + Crina synthesis). Callable by an admin
 * session OR by Hermes / n8n / Telegram with the AGENT_TRIGGER_TOKEN bearer.
 * Returns the full structured report as data/outputs. Never publishes.
 */
export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => ({}))) as TeamRunInput;
  const report = await runTeam(body);

  return NextResponse.json(report, {
    headers: {
      "x-agent-provider": report.synthesisProvider,
      "x-live-posting": "disabled"
    }
  });
}
