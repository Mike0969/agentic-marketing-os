import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCrinaWeeklyContentPlan } from "@/lib/agents/crina-runner";
import { getDashboardData } from "@/lib/data";
import type { WeeklyContentPlanInput } from "@/lib/types";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const input = (await request.json()) as WeeklyContentPlanInput;

  // TODO: Add OpenAI/Claude/DeepSeek adapters behind the same structured runner.
  // TODO: Optionally notify an n8n webhook with the generation request and response.
  const data = await getDashboardData();
  const result = await runCrinaWeeklyContentPlan(input, data);

  return NextResponse.json(result.plan, {
    headers: {
      "x-agent-provider": result.provider,
      "x-agent-fallback": result.fallback ? "true" : "false"
    }
  });
}
