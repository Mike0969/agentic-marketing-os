import { NextResponse } from "next/server";
import { requireAgentAccessOrLocalhost } from "@/lib/auth";
import { buildOrgGraph, type Agent, type Brand, type Source } from "@/lib/brain/org-graph";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/brain/graph — the live org/command graph for the 3D home brain.
// Resilient to per-source query failure (returns the known skeleton); secret-free.
export async function GET(request: Request) {
  const access = await requireAgentAccessOrLocalhost(request);
  if (!access.ok) return access.response;

  let brands: Source<Brand> = { state: "unavailable" };
  let agents: Source<Agent> = { state: "unavailable" };
  const statusByAgentName: Record<string, string> = {};

  const supabase = isSupabaseConfigured() ? createServiceClient() : null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from("brands").select("id,name");
      if (!error && data) brands = { state: "ok", data: data.map((b) => ({ id: String(b.id), name: String(b.name) })) };
    } catch { /* leave unavailable */ }
    try {
      const { data, error } = await supabase.from("agents").select("id,name");
      if (!error && data) agents = { state: "ok", data: data.map((a) => ({ id: String(a.id), name: String(a.name) })) };
    } catch { /* leave unavailable */ }
    try {
      // agent_runs.agent_id is null in practice — join on agent_name; newest status wins.
      const { data } = await supabase.from("agent_runs").select("agent_name,status,created_at").order("created_at", { ascending: false }).limit(300);
      for (const row of (data ?? []) as Array<{ agent_name: string | null; status: string | null }>) {
        const name = row.agent_name;
        if (name && !(name in statusByAgentName) && row.status) statusByAgentName[name] = row.status;
      }
    } catch { /* no statuses -> agents show idle */ }
  }

  const graph = buildOrgGraph({ brands, agents, statusByAgentName, mailingActive: Boolean(process.env.RESEND_API_KEY) });
  return NextResponse.json(graph);
}
