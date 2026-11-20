// Client-safe: field list and types only. The loader lives in brand-proposals-store.ts.

/** Brand fields that can carry a proposed value (mirrors migration 0037's check). */
export const PROPOSABLE_FIELDS = [
  "website",
  "positioning",
  "target_audience",
  "tone_of_voice",
  "pillars",
  "seo_targets",
  "ctas",
  "key_messages",
  "proof_points",
  "offers",
  "competitors"
] as const;

export type ProposableField = (typeof PROPOSABLE_FIELDS)[number];
export type BrandProposal = { value: string; source: string };
/** brandId -> field -> open proposal */
export type BrandProposals = Record<string, Partial<Record<ProposableField, BrandProposal>>>;

export function isProposableField(value: unknown): value is ProposableField {
  return typeof value === "string" && (PROPOSABLE_FIELDS as readonly string[]).includes(value);
}
