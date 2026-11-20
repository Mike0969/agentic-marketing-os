import { NextResponse } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";
import { importInbox } from "@/lib/learning/inbox";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Import from inbox": admin session, or the server script with AGENT_TRIGGER_TOKEN. */
export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;
  const data = await getDashboardData();
  const result = await importInbox(data.brands.map((b) => ({ id: b.id, name: b.name })));
  return NextResponse.json(result);
}
