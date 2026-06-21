import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listSignals, setSignalStatus } from "@/lib/agents/agent-signals";
import type { AgentSignalStatus } from "@/lib/types";

export const runtime = "nodejs";

const validStatuses: AgentSignalStatus[] = ["open", "ack", "resolved", "needs_approval"];

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const statusParam = new URL(request.url).searchParams.get("status");
  const statuses = statusParam ? (statusParam.split(",").filter((s) => validStatuses.includes(s as AgentSignalStatus)) as AgentSignalStatus[]) : undefined;
  return NextResponse.json({ signals: await listSignals(statuses) });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!body.id || !validStatuses.includes(body.status as AgentSignalStatus)) {
    return NextResponse.json({ error: "id and a valid status are required." }, { status: 400 });
  }

  const signal = await setSignalStatus(body.id, body.status as AgentSignalStatus);
  if (!signal) return NextResponse.json({ error: "Signal not found." }, { status: 404 });
  return NextResponse.json({ signal });
}
