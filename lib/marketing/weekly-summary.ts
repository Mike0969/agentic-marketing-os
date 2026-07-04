import { recordAgentRun } from "@/lib/agents/agent-runs";
import { notifyOperator } from "@/lib/marketing/notify";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Weekly digest to the operator's Telegram: what shipped, what came in, what needs them. Runs at most
// once a week from the cron (guarded off the last "Weekly Summary" agent_run).
export async function runWeeklySummary() {
  if (!isSupabaseConfigured()) return { skipped: "no-db" as const };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { skipped: "no-db" as const };

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [pub, leads, pending] = await Promise.all([
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", weekAgo),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("content_items").select("id", { count: "exact", head: true }).eq("approval_status", "pending").is("archived_at", null)
  ]);
  const published = pub.count ?? 0;
  const newLeads = leads.count ?? 0;
  const awaiting = pending.count ?? 0;

  await notifyOperator(`📊 Weekly summary\n• ${published} posts published\n• ${newLeads} new leads\n• ${awaiting} awaiting your approval`);
  await recordAgentRun({
    agentName: "Operations",
    agentId: "agent-crina",
    workflowName: "Weekly Summary",
    provider: "internal",
    status: "success",
    input: {},
    output: { published, newLeads, awaiting },
    error: null,
    model: null,
    durationMs: 0
  });
  return { published, newLeads, awaiting };
}
