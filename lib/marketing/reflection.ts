import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// P3 — the reflection pass. Karpathy VII (read the traces) + self-improving #3 (rewrite the rule, not
// the output). Reads the loop's own receipts + grader divergences and proposes EXACTLY ONE concrete
// rule change. Bounded to a single model call; runs weekly from the cron. The proposal is persisted
// for a human/Codex to promote into the actual rules (grader-calibration.md / content rules).

const reflectionSchema = {
  biggest_recurring_weakness: "the one pattern the traces show most often",
  proposed_rule_change: "ONE concrete rule to add or change that prevents it up front",
  where_it_applies: "grader | content | visual",
  evidence: "the receipts / divergences that back this"
};

export async function runReflection() {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase not configured." };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { ok: false as const, error: "Supabase not available." };

  const { data: receipts } = await supabase
    .from("loop_receipts")
    .select("loop_type,decision,stop_reason,judge_notes,score_after,created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  const { data: divergences } = await supabase
    .from("feedback_memory")
    .select("reason,content_summary")
    .eq("content_type", "grader_divergence")
    .order("created_at", { ascending: false })
    .limit(15);

  if (!((receipts?.length ?? 0) || (divergences?.length ?? 0))) return { ok: true as const, skipped: "no-data" as const };

  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Reflection editor",
    task: "Weekly reflection",
    instructions:
      "You are reflecting on the loop's OWN traces. From these judge receipts + grader divergences, find the SINGLE biggest recurring weakness and propose EXACTLY ONE concrete rule change that prevents it up front — fix the rule that let the bug happen, not one output. Be specific and evidence-led. Do not propose more than one change.",
    outputSchema: reflectionSchema,
    input: { receipts: receipts ?? [], grader_divergences: divergences ?? [] },
    brainFiles: ["approval-rules.md"],
    temperature: 0.2,
    routeOrigin: "api.marketing.reflection"
  });

  const json = (run.json ?? {}) as Record<string, unknown>;
  const proposal = typeof json.proposed_rule_change === "string" ? json.proposed_rule_change.trim() : "";
  const weakness = typeof json.biggest_recurring_weakness === "string" ? json.biggest_recurring_weakness.trim() : "";
  const where = typeof json.where_it_applies === "string" ? json.where_it_applies.trim() : "grader";

  if (proposal) {
    await supabase
      .from("feedback_memory")
      .insert({
        agent_id: "agent-crina",
        content_type: "reflection_rule_proposal",
        content_summary: `Weekly reflection: ${weakness}`.slice(0, 400),
        content_full: { where, weakness, proposal, evidence: json.evidence ?? null },
        decision: "remade",
        reason: proposal,
        decided_by: "crina",
        loop_iteration: 1
      })
      .then(() => {}, () => {});
  }

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Weekly Reflection",
    provider: run.provider,
    status: run.ok ? "success" : "fallback",
    input: { receipts: receipts?.length ?? 0, divergences: divergences?.length ?? 0, routeOrigin: "api.marketing.reflection" },
    output: { weakness, where, proposal: proposal.slice(0, 200) },
    error: run.ok ? null : "fallback",
    model: run.modelUsed,
    durationMs: run.durationMs
  });

  return { ok: true as const, weakness, proposal, where };
}
