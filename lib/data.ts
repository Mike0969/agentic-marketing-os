import { seedData } from "@/lib/seed";
import { unstable_noStore as noStore } from "next/cache";
import type { DashboardData } from "@/lib/types";
import { readLocalDashboardData } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function getDashboardData(): Promise<DashboardData> {
  noStore();

  if (!isSupabaseConfigured()) {
    return readLocalDashboardData();
  }

  const supabase = await createClient();

  if (!supabase) {
    return seedData;
  }

  const [brands, agents, campaigns, contentItems, approvals] = await Promise.all([
    supabase.from("brands").select("*").order("name"),
    supabase.from("agents").select("*").order("name"),
    supabase.from("campaigns").select("*").order("start_date", { ascending: false }),
    supabase.from("content_items").select("*").order("scheduled_at", { ascending: false, nullsFirst: false }),
    supabase.from("approvals").select("*").order("decided_at", { ascending: false, nullsFirst: false })
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
    activity: seedData.activity
  };
}

export function byId<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}
