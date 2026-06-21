import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addAgentTarget, listAgentTargets, removeAgentTarget, updateAgentTarget } from "@/lib/agents/agent-config-store";
import type { AgentTargetType } from "@/lib/types";

export const runtime = "nodejs";

const validTypes: AgentTargetType[] = ["competitor", "topic", "platform", "brand"];

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ targets: await listAgentTargets() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { label?: string; type?: string; notes?: string };
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "Label is required." }, { status: 400 });

  const type = validTypes.includes(body.type as AgentTargetType) ? (body.type as AgentTargetType) : "competitor";
  const target = await addAgentTarget({ label, type, notes: body.notes });
  return NextResponse.json({ target });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { id?: string; active?: boolean; label?: string; notes?: string };
  if (!body.id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const patch: { active?: boolean; label?: string; notes?: string } = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.label === "string") patch.label = body.label;
  if (typeof body.notes === "string") patch.notes = body.notes;

  const target = await updateAgentTarget(body.id, patch);
  if (!target) return NextResponse.json({ error: "Target not found." }, { status: 404 });
  return NextResponse.json({ target });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  await removeAgentTarget(id);
  return NextResponse.json({ ok: true });
}
