import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runSubAgent } from "@/lib/agents/sub-agent-runner";
import { subAgentConfigs } from "@/lib/agents/agent-catalog";

export const runtime = "nodejs";

/**
 * Publishing Agent — DRAFTS ONLY. This route never publishes, schedules, or
 * posts to any platform. The output is forced to a non-publishing state
 * regardless of what the model returns (defense in depth).
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const input = await request.json().catch(() => ({}));
  const result = await runSubAgent(subAgentConfigs.publishing, input);

  // Defense in depth: enforce no-publish invariants on whatever was returned.
  const safeOutput = { ...result.output, published: false, status: "draft", livePostingEnabled: false };

  return NextResponse.json(
    { ...result, output: safeOutput },
    { headers: { "x-agent-provider": result.provider, "x-agent-fallback": result.fallback ? "true" : "false", "x-publishing-mode": "draft-only" } }
  );
}
