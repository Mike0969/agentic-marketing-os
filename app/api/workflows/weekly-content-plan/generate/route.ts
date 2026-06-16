import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { generateWeeklyContentPlan } from "@/lib/workflows/weekly-content-plan";
import type { WeeklyContentPlanInput } from "@/lib/types";

export async function POST(request: Request) {
  const input = (await request.json()) as WeeklyContentPlanInput;

  // TODO: Route to Hermes/OpenAI/Claude/DeepSeek when API credentials are configured.
  // TODO: Optionally notify an n8n webhook with the generation request and response.
  // For now, Crina uses deterministic high-quality mock generation so the OS remains usable offline.
  const data = await getDashboardData();
  const plan = generateWeeklyContentPlan(input, data);

  return NextResponse.json(plan);
}
