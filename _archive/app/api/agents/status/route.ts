import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAgentStatus } from "@/lib/agents/agent-status";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json(await getAgentStatus());
}
