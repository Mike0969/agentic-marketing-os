import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// P4b — "the bottleneck always moves" (Karpathy IX). Aggregates recent loop receipts so the operator
// can see where the loop spends effort and fails most: which loop type reworks most, where fallbacks
// cluster, average score by loop type. This is what makes the NEXT thing to fix visible. Read-only.

export type LoopBottleneck = {
  loop_type: string;
  runs: number;
  rework_rate: number;
  fallback_rate: number;
  avg_score: number | null;
};

export async function getLoopBottlenecks(limit = 200): Promise<{ sample: number; byType: LoopBottleneck[] } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return null;
  const { data } = await supabase
    .from("loop_receipts")
    .select("loop_type,decision,fallback_used,score_after")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as Array<{ loop_type: string | null; decision: string | null; fallback_used: boolean | null; score_after: number | null }>;

  const byType = new Map<string, { runs: number; reworks: number; fallbacks: number; scoreSum: number; scoreN: number }>();
  for (const r of rows) {
    const type = r.loop_type ?? "unknown";
    const agg = byType.get(type) ?? { runs: 0, reworks: 0, fallbacks: 0, scoreSum: 0, scoreN: 0 };
    agg.runs += 1;
    if (r.decision === "rework") agg.reworks += 1;
    if (r.fallback_used) agg.fallbacks += 1;
    if (typeof r.score_after === "number") { agg.scoreSum += r.score_after; agg.scoreN += 1; }
    byType.set(type, agg);
  }

  const summary: LoopBottleneck[] = [...byType.entries()]
    .map(([loop_type, a]) => ({
      loop_type,
      runs: a.runs,
      rework_rate: a.runs ? a.reworks / a.runs : 0,
      fallback_rate: a.runs ? a.fallbacks / a.runs : 0,
      avg_score: a.scoreN ? Math.round(a.scoreSum / a.scoreN) : null
    }))
    .sort((x, y) => y.rework_rate - x.rework_rate);

  return { sample: rows.length, byType: summary };
}
