import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { readAgentMemory, writeAgentMemory } from "@/lib/agents/hermes-registry";
import { getLatestConversionOutcomes } from "@/lib/marketing/conversion-memory";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// L4 — the Editor pass. Raw appended memory bloats and makes agents WORSE; this re-distils the
// accumulated conversion insights + outcome metrics into a TIGHT ranked playbook per brand, drops
// rules the numbers don't support, and REWRITES the Hermes brain (replacing bloat) so every agent
// reads a sharp set on the next run. Objective: weighted by paid_conversion_rate / paid / revenue.

const consolidateSchema = {
  rules: [{ rule: "tight, concrete, high-signal rule", evidence: "the metric/outcome that backs it" }],
  brain_summary: "one tight paragraph of what converts for this brand (replaces prior bloat)"
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const rec = (o: unknown): Record<string, unknown> => (o && typeof o === "object" ? (o as Record<string, unknown>) : {});

export async function runMemoryConsolidation(args: { brandId?: string } = {}) {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase not configured." };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { ok: false as const, error: "Supabase not available." };

  const { data: brandRows } = args.brandId
    ? await supabase.from("brands").select("id,name").eq("id", args.brandId)
    : await supabase.from("brands").select("id,name");
  const brands = (brandRows ?? []) as Array<{ id: string; name: string }>;

  const blocks: string[] = [];
  let totalRules = 0;
  let provider = "internal";
  let model: string | null = null;
  let durationMs = 0;

  for (const brand of brands) {
    const { data: memory } = await supabase
      .from("conversion_memory")
      .select("insight,recommendation,hook,platform,paid_conversion_rate,created_at")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(40);
    const outcomes = await getLatestConversionOutcomes(brand.id, 30);
    if (!((memory?.length ?? 0) || outcomes.length)) continue;

    const run = await runMarketingAgentModel({
      agentId: "agent-conversion",
      fallbackAgentName: "Conversion Agent",
      fallbackRole: "Memory editor",
      task: "Consolidate conversion memory",
      instructions:
        "You are the memory EDITOR. Consolidate the accumulated conversion insights + the outcome metrics into a TIGHT ranked set of 3-7 high-signal rules for THIS brand only. Drop duplicates and drop any rule the metrics do not support — weight by paid_conversion_rate, paid, and revenue (more leads/investors/capital = stronger). Then write one tight paragraph (brain_summary) of what converts, written to REPLACE the prior bloated notes. Be concrete and evidence-led. No posting.",
      outputSchema: consolidateSchema,
      input: { brand, insights: memory ?? [], outcomes },
      brainFiles: ["approval-rules.md"],
      temperature: 0.2,
      routeOrigin: "api.sales.consolidate"
    });
    provider = run.provider;
    model = run.modelUsed;
    durationMs += run.durationMs;

    const json = rec(run.json);
    const rules = Array.isArray(json.rules) ? json.rules : [];
    const summary = str(json.brain_summary);

    const block =
      `# What converts for ${brand.name}\n${summary}\nRules:\n` +
      rules.slice(0, 7).map((r, i) => `${i + 1}. ${str(rec(r).rule)}`).join("\n");
    blocks.push(block);

    // Re-rank: write the consolidated rules as fresh high-rank rows so the read-back surfaces them.
    const rows = rules.slice(0, 7).map((r, i) => ({
      brand_id: brand.id,
      insight: str(rec(r).rule).slice(0, 500) || "Converting rule",
      recommendation: null,
      rank: 1000 - i,
      paid_conversion_rate: null,
      evidence: { consolidated: true, note: str(rec(r).evidence) },
      source: "agent_estimated"
    }));
    if (rows.length) {
      await supabase.from("conversion_memory").insert(rows);
      totalRules += rows.length;
    }
  }

  // REWRITE the Hermes conversion brain sharp (replace bloat). Per-brand blocks, all brands at once.
  if (blocks.length) {
    const doc = `# Consolidated conversion playbook (${new Date().toISOString().slice(0, 10)})\nThe sharp, current set of what converts. Older append-notes are superseded by this.\n\n${blocks.join("\n\n")}\n`;
    try {
      await writeAgentMemory("agent-conversion", doc);
      // Keep Crina's file sharp too: replace it with the consolidated playbook (the only conversion
      // content Crina needs to read each run). Other agents' memory files are untouched.
      const prevCrina = await readAgentMemory("agent-crina");
      const hadOnlyConversion = !prevCrina || /what converts/i.test(prevCrina);
      await writeAgentMemory("agent-crina", hadOnlyConversion ? doc : `${prevCrina.slice(0, 1500)}\n\n${doc}`);
    } catch {
      // brain write is best-effort
    }
  }

  await recordAgentRun({
    agentName: "Conversion Agent",
    agentId: "agent-conversion",
    workflowName: "Consolidate Memory",
    provider,
    status: "success",
    input: { brands: brands.length, routeOrigin: "api.sales.consolidate" },
    output: { brands_consolidated: blocks.length, rules: totalRules },
    error: null,
    model,
    durationMs
  });

  return { ok: true as const, brands_consolidated: blocks.length, rules: totalRules };
}
