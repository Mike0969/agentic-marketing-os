// Preset human-reject reasons for the Ready-to-Post gate. One-tap, structured feedback that maps to
// the loop's rubric dimensions, so a rejection teaches the agents precisely (vs vague free text).
// `kind` routes the rework: visual reasons regenerate the image, content reasons regenerate the copy.
// Shared by the UI (chips) and the rework route (routing + storage) so they never drift.

export type RejectKind = "visual" | "content";

export const REJECT_REASONS: { label: string; kind: RejectKind }[] = [
  { label: "Image not good", kind: "visual" },
  { label: "Image off-brand or generic", kind: "visual" },
  { label: "Image unclear", kind: "visual" },
  { label: "Weak or no hook", kind: "content" },
  { label: "Too generic / templated", kind: "content" },
  { label: "Not personal / not human", kind: "content" },
  { label: "Unclear / confusing", kind: "content" },
  { label: "Weak CTA", kind: "content" },
  { label: "Thin proof / not credible", kind: "content" }
];

/** Map selected reason labels to which makers should rework. Empty set => caller falls back. */
export function routeFromTags(tags: string[]): { visual: boolean; content: boolean } {
  const kinds = new Set(REJECT_REASONS.filter((r) => tags.includes(r.label)).map((r) => r.kind));
  return { visual: kinds.has("visual"), content: kinds.has("content") };
}
