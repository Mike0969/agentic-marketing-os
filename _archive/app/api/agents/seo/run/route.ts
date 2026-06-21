import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runSubAgent } from "@/lib/agents/sub-agent-runner";
import { subAgentConfigs } from "@/lib/agents/agent-catalog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const input = await request.json().catch(() => ({}));
  const result = await runSubAgent(subAgentConfigs.seo, input);

  return NextResponse.json(result, {
    headers: { "x-agent-provider": result.provider, "x-agent-fallback": result.fallback ? "true" : "false" }
  });
}
