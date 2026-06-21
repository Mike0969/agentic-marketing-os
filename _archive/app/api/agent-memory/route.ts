import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readAgentMemory, writeAgentMemory } from "@/lib/agents/hermes-registry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const agentId = new URL(request.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId is required." }, { status: 400 });

  return NextResponse.json({ agentId, content: await readAgentMemory(agentId) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { agentId?: string; content?: string };
  if (!body.agentId) return NextResponse.json({ error: "agentId is required." }, { status: 400 });

  const ok = await writeAgentMemory(body.agentId, body.content ?? "");
  if (!ok) return NextResponse.json({ error: "Could not write memory (no brain path configured)." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
