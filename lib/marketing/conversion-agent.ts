import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { readAgentMemory, writeAgentMemory } from "@/lib/agents/hermes-registry";
import { getSearchPerformanceForBrand } from "@/lib/analytics/search-console";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

const conversionSchema = {
  funnel_estimates: [
    {
      campaign_id: "string",
      platform: "string",
      awareness: "Reach / impressions count.",
      signups: "Leads captured count.",
      activations: "Qualified investor conversations or due-diligence steps count.",
      paid: "Investors committed count.",
      revenue_estimate: "Capital committed in USD.",
      confidence: "low | medium | high"
    }
  ],
  what_converts: [
    { rank: 0, insight: "what is converting leads into investors/capital and why", hook: "the converting hook", platform: "string", content_type: "string", paid_conversion_rate: "investors / leads", evidence: "short evidence" }
  ],
  recommendations_for_crina: ["specific instruction to raise next-campaign leads, investor conversion, and capital committed"]
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function rec(obj: unknown): Record<string, unknown> {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
}

export async function runConversionAnalysis(args: { brandId: string; campaignId?: string }) {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase not configured." };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { ok: false as const, error: "Supabase not available." };

  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", args.brandId).maybeSingle();
  const brand = brandRow as Brand | null;
  if (!brand) return { ok: false as const, error: "Brand not found." };

  const { data: campaignRows } = args.campaignId
    ? await supabase.from("campaigns").select("id,title").eq("id", args.campaignId)
    : await supabase.from("campaigns").select("id,title").eq("brand_id", args.brandId).in("status", ["active", "completed"]).limit(10);
  const campaigns = (campaignRows ?? []) as Array<{ id: string; title: string }>;
  const campaignIds = campaigns.map((c) => c.id);

  const { data: items } = campaignIds.length
    ? await supabase.from("content_items").select("id,campaign_id,platform,content_type,hook,published_at,performance_summary").in("campaign_id", campaignIds)
    : { data: [] };
  const { data: priorOutcomes } = await supabase.from("conversion_outcomes").select("*").eq("brand_id", args.brandId).order("created_at", { ascending: false }).limit(20);
  const { data: recentLeads, count: realLeadCount } = await supabase
    .from("leads")
    .select("id,name,email,company,segment,wants,source,created_at", { count: "exact" })
    .eq("brand_id", args.brandId)
    .order("created_at", { ascending: false })
    .limit(20);

  let gscTotals: unknown = null;
  let gscConnected = false;
  try {
    const gsc = await getSearchPerformanceForBrand(brand.name);
    gscTotals = gsc.totals ?? null;
    gscConnected = Boolean(gsc.connected);
  } catch {
    // GSC is an optional signal; ignore failures.
  }

  const run = await runMarketingAgentModel({
    agentId: "agent-conversion",
    fallbackAgentName: "Conversion Agent",
    fallbackRole: "Investor conversion analyst",
    task: "Estimate Investor Capital Funnel",
    instructions:
      "Estimate the investor-capital funnel (Reach → Lead → Investor → Capital committed $) per campaign from the signals provided (GSC clicks/impressions, real lead_capture outcomes/recent_leads, post engagement notes in performance_summary, and any operator-logged outcomes). IMPORTANT field mapping: awareness = Reach, signups = Leads, activations = qualified investor conversations / due-diligence steps, paid = Investors committed, revenue_estimate = capital committed in USD. Count only form submissions, investor inquiries, and deck/memo/call requests as real Leads; never count GSC clicks as leads. Be conservative and mark confidence. Then RANK what converts leads into investors and dollars raised (hooks/angles/platforms) and give specific, concrete recommendations for Crina to raise next-campaign leads, investor conversion, and capital committed. Estimates only — never post, never call external services.",
    outputSchema: conversionSchema,
    input: { brand, campaigns, content_items: items, prior_outcomes: priorOutcomes, real_lead_count: realLeadCount ?? 0, recent_leads: recentLeads ?? [], gsc_totals: gscTotals, gsc_connected: gscConnected },
    brainFiles: ["content-formulas.md", "approval-rules.md"],
    temperature: 0.3,
    routeOrigin: "api.sales.analyze"
  });

  const json = rec(run.json);
  const funnel = Array.isArray(json.funnel_estimates) ? json.funnel_estimates : [];
  const whatConverts = Array.isArray(json.what_converts) ? json.what_converts : [];
  const recs = Array.isArray(json.recommendations_for_crina) ? json.recommendations_for_crina.map(String) : [];

  // (a) investor-capital funnel facts → conversion_outcomes (agent-estimated).
  // DB names stay generic: signups=leads, paid=investors, revenue=capital committed.
  const outcomeRows = funnel.map((entry) => {
    const f = rec(entry);
    const awareness = num(f.awareness);
    const signups = num(f.signups);
    const paid = num(f.paid);
    const cid = typeof f.campaign_id === "string" && campaignIds.includes(f.campaign_id) ? f.campaign_id : args.campaignId ?? null;
    const conf = str(f.confidence);
    return {
      brand_id: args.brandId,
      campaign_id: cid,
      source: "agent_estimated",
      awareness,
      signups,
      activations: num(f.activations),
      paid,
      revenue: num(f.revenue_estimate),
      signup_rate: awareness ? signups / awareness : null,
      paid_conversion_rate: signups ? paid / signups : null,
      recorded_by: "agent-conversion",
      estimate_confidence: ["low", "medium", "high"].includes(conf) ? conf : "low"
    };
  });
  if (outcomeRows.length) await supabase.from("conversion_outcomes").insert(outcomeRows);

  // (b) ranked insights → conversion_memory
  const memoryRows = whatConverts.slice(0, 8).map((entry, idx) => {
    const w = rec(entry);
    const evidence = w.evidence && typeof w.evidence === "object" ? (w.evidence as Record<string, unknown>) : { note: str(w.evidence) };
    return {
      brand_id: args.brandId,
      platform: str(w.platform) || null,
      content_type: str(w.content_type) || null,
      hook: str(w.hook) || null,
      insight: str(w.insight).slice(0, 500) || "Converting pattern",
      recommendation: str(w.recommendation) || recs[0] || null,
      rank: num(w.rank) || 8 - idx,
      paid_conversion_rate: num(w.paid_conversion_rate) || null,
      evidence,
      source: "agent_estimated"
    };
  });
  if (memoryRows.length) await supabase.from("conversion_memory").insert(memoryRows);

  // (c) distilled wisdom → Hermes brain (compounding second brain)
  try {
    const date = new Date().toISOString().slice(0, 10);
    const distilled = `\n## Conversion learnings for ${brand.name} (${date})\n` +
      whatConverts.slice(0, 5).map((e) => `- ${str(rec(e).insight).slice(0, 180)}`).join("\n") +
      (recs.length ? `\nDo next: ${recs.slice(0, 3).join("; ")}` : "");
    const prevConv = await readAgentMemory("agent-conversion");
    await writeAgentMemory("agent-conversion", `${prevConv ? prevConv.slice(-4000) : ""}${distilled}`);
    const crinaNote = `\n## What converts for ${brand.name}\n` + whatConverts.slice(0, 3).map((e) => `- ${str(rec(e).insight).slice(0, 160)}`).join("\n");
    const prevCrina = await readAgentMemory("agent-crina");
    await writeAgentMemory("agent-crina", `${prevCrina ? prevCrina.slice(-4000) : ""}${crinaNote}`);
  } catch {
    // Hermes brain write is best-effort; never break the analysis.
  }

  await recordAgentRun({
    agentName: "Conversion Agent",
    agentId: "agent-conversion",
    workflowName: "Analyze Investor Capital Conversion",
    provider: run.provider,
    status: run.ok ? "success" : "fallback",
    input: { brandId: args.brandId, campaignId: args.campaignId ?? null, gsc_connected: gscConnected, routeOrigin: "api.sales.analyze" },
    output: { outcomes: outcomeRows.length, insights: memoryRows.length, recommendations: recs.length, model: run.modelUsed },
    error: run.ok ? null : run.error ?? "Conversion analysis fell back.",
    model: run.modelUsed,
    durationMs: run.durationMs
  });

  return { ok: true as const, outcomes: outcomeRows.length, insights: memoryRows.length, recommendations: recs };
}
