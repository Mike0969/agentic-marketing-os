/**
 * One plain sentence for an agent run's output, for the Agents board — never raw JSON.
 * Uses the agent's own summary when it gave one; otherwise describes the known shapes the
 * automation jobs record, and falls back to a short "key: value" sentence.
 */

const words = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summarizeRunOutput(output: Record<string, unknown> | null | undefined, error?: string | null): string | null {
  if (error) return error;
  if (!output) return null;
  for (const key of ["summary", "statusSummary", "response", "nextAction"]) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const num = (key: string) => (typeof output[key] === "number" ? (output[key] as number) : null);

  // Weekly summary: { awaiting, newLeads, published }
  if (num("awaiting") !== null || num("newLeads") !== null) {
    return `${plural(num("awaiting") ?? 0, "item")} waiting for review, ${plural(num("newLeads") ?? 0, "new lead")}, ${num("published") ?? 0} published.`;
  }
  // Memory consolidation: { rules, brands_consolidated }
  if (num("brands_consolidated") !== null) {
    return `Memory consolidated for ${plural(num("brands_consolidated") ?? 0, "brand")}, ${plural(num("rules") ?? 0, "new rule")}.`;
  }
  // Reflection: { weakness, proposal }
  if ("weakness" in output || "proposal" in output) {
    const weakness = String(output.weakness ?? "").trim();
    return weakness ? `Reflection: ${weakness}` : "Reflection ran; no new weakness found.";
  }
  // A drafted post: { title?, hook?, body, CTA|cta }
  const body = output.title ?? output.hook ?? output.body;
  if (typeof body === "string" && body.trim()) {
    const cta = output.CTA ?? output.cta;
    return `Draft: ${body.trim().slice(0, 120)}${typeof cta === "string" && cta ? ` · CTA: ${cta}` : ""}`;
  }
  // Generic: the first few simple fields as a sentence.
  const parts = Object.entries(output)
    .filter(([key, value]) => ["string", "number", "boolean"].includes(typeof value) && !/(^id$|_id$|url|token|model|provider)/i.test(key))
    .slice(0, 3)
    .map(([key, value]) => `${words(key)}: ${String(value).slice(0, 60)}`);
  return parts.length ? `${parts.join(", ")}.` : "Run finished.";
}
