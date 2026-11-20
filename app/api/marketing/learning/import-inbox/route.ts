import { NextResponse } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { importInbox } from "@/lib/learning/inbox";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Import from inbox": admin session, or the server script with AGENT_TRIGGER_TOKEN. */
export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;
  // Brands from the database with the service client: a token-only call has no login session, and the
  // session-based dashboard data would fall back to the seed brands (non-database ids -> brand NULL).
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const { data: brands, error } = await db.from("brands").select("id,name");
  if (error || !brands?.length) return NextResponse.json({ error: `Cannot read the brands${error ? `: ${error.message}` : ""}.` }, { status: 503 });
  const result = await importInbox(brands as Array<{ id: string; name: string }>);
  return NextResponse.json(result);
}
