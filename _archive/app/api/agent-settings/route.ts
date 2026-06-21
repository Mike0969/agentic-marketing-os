import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAgentSettings, setAgentModel } from "@/lib/agents/agent-config-store";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ settings: await listAgentSettings() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { agentId?: string; model?: string | null };
  if (!body.agentId) return NextResponse.json({ error: "agentId is required." }, { status: 400 });

  const setting = await setAgentModel(body.agentId, body.model ?? null);
  return NextResponse.json({ setting });
}
