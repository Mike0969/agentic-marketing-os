import { seedData } from "@/lib/seed";
import { unstable_noStore as noStore } from "next/cache";
import type { AgentRun, DashboardData } from "@/lib/types";
import { readLocalDashboardData } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function getDashboardData(): Promise<DashboardData> {
  noStore();

  if (!isSupabaseConfigured()) {
    return readLocalDashboardData();
  }

  const supabase = await createClient();

  if (!supabase) {
    return seedData;
  }

  const [brands, agents, campaigns, contentItems, approvals, activity] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("agents").select("*").order("name"),
    supabase.from("campaigns").select("*").order("start_date", { ascending: false }),
    supabase.from("content_items").select("*").order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase.from("approvals").select("*").order("decided_at", { ascending: false, nullsFirst: false }),
    supabase.from("activity").select("*").order("created_at", { ascending: false }).limit(20)
  ]);

  if (brands.error || agents.error || campaigns.error || contentItems.error || approvals.error) {
    return readLocalDashboardData();
  }

  if (!brands.data?.length || !agents.data?.length || !campaigns.data?.length) {
    return readLocalDashboardData();
  }

  return {
    brands: brands.data ?? seedData.brands,
    agents: agents.data ?? seedData.agents,
    campaigns: campaigns.data ?? seedData.campaigns,
    contentItems: contentItems.data ?? seedData.contentItems,
    approvals: approvals.data ?? seedData.approvals,
    activity: activity.error ? seedData.activity : activity.data ?? seedData.activity
  };
}

export function byId<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export async function getAgentRuns(agentName?: string, limit = 10): Promise<AgentRun[]> {
  noStore();

  if (!isSupabaseConfigured()) {
    const data = await readLocalDashboardData();
    return (data.agentRuns ?? []).filter((run) => !agentName || run.agent_name === agentName).slice(0, limit);
  }

  // Prefer the service-role client so the report/observability reads work for
  // token-triggered (no session) callers too.
  const supabase = createServiceClient() ?? (await createClient());

  if (!supabase) {
    return [];
  }

  // select("*") so newly added observability columns are returned when present
  // but a DB that has not yet run the migration does not error.
  let query = supabase
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agentName) {
    query = query.eq("agent_name", agentName);
  }

  const { data, error } = await query;

  if (error) {
    return [];
  }

  return (data ?? []) as AgentRun[];
}
