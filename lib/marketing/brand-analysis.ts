import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { libraryContext } from "@/lib/learning/library";
import { defaultVault, learningContext } from "@/lib/learning/vault";
import { PROPOSABLE_FIELDS, type ProposableField } from "@/lib/marketing/brand-proposals";
import { notifyOperator } from "@/lib/marketing/notify";
import { publicUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";
import type { Brand } from "@/lib/types";

/**
 * Brands → Analyze (Mihai 2026-11-20): Crina reads the brand fields, the ~10 most relevant Learning
 * library items for this brand (soul, truth book, prohibited claims, newsletters…) and the recent
 * Yes/Rework notes, then PROPOSES an improved value for each brand field. The proposals appear as
 * "Proposed — use / dismiss" boxes; nothing is written to the brand until Mihai presses Use.
 * Runs in the background (one per brand); Telegram + Slack get a line with the Brands link when done.
 */

export type AnalysisStatus = { state: "running" | "done" | "error"; startedAt: string; finishedAt?: string; summary?: string; proposed?: number };
const status = new Map<string, AnalysisStatus>();
export const getAnalysisStatus = (brandId: string) => status.get(brandId) ?? null;

const FIELDS = PROPOSABLE_FIELDS.filter((f) => f !== "website");
const FIELD_HELP: Record<string, string> = {
  positioning: "one paragraph: what the brand is and why it matters",
  target_audience: "who it is for, concretely",
  tone_of_voice: "how it sounds (3-6 traits + one do / one don't)",
  pillars: "3-5 content pillars, one per line",
  seo_targets: "5-10 search terms, comma separated",
  ctas: "3-5 reusable calls to action, one per line",
  key_messages: "3-5 key messages, one per line",
  proof_points: "facts the materials actually support, one per line",
  offers: "what is offered, one per line",
  competitors: "named competitors or alternatives, comma separated"
};

/** Pure: keep only proposals that are new text for a known field (not empty, not identical to today). */
export function usefulProposals(brand: Partial<Record<string, unknown>>, raw: unknown): Array<{ field: ProposableField; value: string }> {
  const proposals = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return FIELDS.flatMap((field) => {
    const v = proposals[field];
    const value = (Array.isArray(v) ? v.map(String).join("\n") : typeof v === "string" ? v : "").trim().slice(0, 4000);
    const current = String(brand[field] ?? "").trim();
    return value && value !== current ? [{ field, value }] : [];
  });
}

export function startBrandAnalysis(brandId: string, origin: string): AnalysisStatus {
  const running = status.get(brandId);
  if (running?.state === "running") return running;
  const s: AnalysisStatus = { state: "running", startedAt: new Date().toISOString() };
  status.set(brandId, s);
  void (async () => {
    let result: AnalysisStatus;
    try {
      result = await analyze(brandId);
    } catch (error) {
      result = { state: "error", startedAt: s.startedAt, summary: error instanceof Error ? error.message.slice(0, 200) : "Analysis failed." };
    }
    result.finishedAt = new Date().toISOString();
    status.set(brandId, result);
    try {
      const supabase = createServiceClient();
      const { data } = supabase ? await supabase.from("brands").select("name").eq("id", brandId).maybeSingle() : { data: null };
      const name = (data as { name?: string } | null)?.name ?? "Brand";
      const link = publicUrl("/marketing/brands", origin).toString();
      await notifyOperator(`${result.state === "done" ? "✅" : "⚠️"} Brand "${name}": ${result.summary ?? ""}\n${link}`);
    } catch {
      // alert is best-effort
    }
  })();
  return s;
}

async function analyze(brandId: string): Promise<AnalysisStatus> {
  const startedAt = status.get(brandId)?.startedAt ?? new Date().toISOString();
  const supabase = createServiceClient();
  if (!supabase) return { state: "error", startedAt, summary: "The database is not available." };
  const { data: row } = await supabase.from("brands").select("*").eq("id", brandId).maybeSingle();
  const brand = row as Brand | null;
  if (!brand) return { state: "error", startedAt, summary: "Brand not found." };
  const library = await libraryContext(brandId, `${brand.name} brand soul truth book prohibited claims content rules audience offer founder vision newsletter visual style`, undefined, { limit: 10, excerpt: 1500 });
  const notes = (await learningContext(defaultVault(brand.name), { part: "text" })).text;
  const current = Object.fromEntries(FIELDS.map((f) => [f, (brand as unknown as Record<string, unknown>)[f] ?? ""]));
  const outputSchema = { proposals: Object.fromEntries(FIELDS.map((f) => [f, FIELD_HELP[f]])), summary: "two sentences: what you changed and why" };
  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Brand analysis: propose improved brand fields",
    instructions: `Analyse this brand and PROPOSE an improved value for each brand field, written as the field itself (ready to use), not as advice. Use the brand's own materials below (soul, truth book, content rules, newsletters, audience, offer) and Mihai's past Yes/Rework notes. Follow the prohibited-claims and content rules strictly: do not state any claim those materials say needs sign-off or is prohibited; say it as "planned" only where the materials allow it, otherwise leave it out. Never invent numbers, results, partners or proof. Keep a field's current text when it is already right (return it unchanged).\n\nCurrent brand fields:\n${JSON.stringify(current, null, 1)}\n\n${library}\n\n${notes}`,
    outputSchema,
    input: { brand: { name: brand.name, website: brand.website } },
    brainFiles: ["approval-rules.md"],
    temperature: 0.3,
    routeOrigin: "api.marketing.brands.analyze"
  });
  if (!run.ok || !run.json) return { state: "error", startedAt, summary: `Crina could not analyse it: ${run.error ?? "no answer"}.` };
  const json = run.json as { proposals?: unknown; summary?: unknown };
  const proposals = usefulProposals(brand as unknown as Record<string, unknown>, json.proposals);
  const source = `Crina's brand analysis (${new Date().toISOString().slice(0, 10)})`;
  for (const p of proposals) {
    // At most one open proposal per field: the new one replaces an older open one.
    await supabase.from("brand_field_proposals").delete().eq("brand_id", brandId).eq("field", p.field).eq("status", "proposed");
    await supabase.from("brand_field_proposals").insert({ brand_id: brandId, field: p.field, value: p.value, source, status: "proposed" });
  }
  await recordAgentRun({ agentName: "Crina", agentId: "agent-crina", workflowName: "Brand analysis (proposals)", provider: run.provider, status: "success", input: { brandId, routeOrigin: "api.marketing.brands.analyze" }, output: { proposed: proposals.map((p) => p.field), summary: json.summary }, error: null, model: run.modelUsed ?? null, durationMs: run.durationMs ?? 0 });
  const summary = proposals.length
    ? `${proposals.length} field proposal(s) ready (${proposals.map((p) => p.field.replace("_", " ")).join(", ")}). Open Brands to use or dismiss each.`
    : "No changes proposed: the brand fields already match the materials.";
  return { state: "done", startedAt, summary, proposed: proposals.length };
}
