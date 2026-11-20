import type { Brand } from "@/lib/types";

/**
 * Which brand fields the agents read are still placeholder text or empty.
 * Used by Brands (to show Mihai what to fill in) and by the campaign run (to
 * explain a safety block in plain words).
 */

type ContextField = { label: string; keys: Array<keyof Brand> };

export const BRAND_CONTEXT_FIELDS: ContextField[] = [
  { label: "Website", keys: ["website"] },
  { label: "Positioning", keys: ["positioning"] },
  { label: "Target audience", keys: ["target_audience"] },
  { label: "Tone of voice", keys: ["tone_of_voice"] },
  { label: "Pillars", keys: ["pillars", "content_pillars"] },
  { label: "SEO targets", keys: ["seo_targets"] },
  { label: "CTAs", keys: ["ctas", "reusable_ctas"] },
  { label: "Key messages", keys: ["key_messages"] },
  { label: "Proof points", keys: ["proof_points"] },
  { label: "Offers", keys: ["offers"] },
  { label: "Competitors", keys: ["competitors"] }
];

const PLACEHOLDER = /\bplaceholder\b|\btest brand\b|\bpending\b|\btbd\b|lorem ipsum|\bexample\.(com|org|net)\b/i;

export type FieldState = "placeholder" | "empty" | "ok";

export function brandFieldState(brand: Partial<Brand>, keys: Array<keyof Brand>): FieldState {
  const values = keys.map((key) => String(brand[key] ?? "").trim()).filter(Boolean);
  if (!values.length) return "empty";
  return values.some((value) => PLACEHOLDER.test(value)) ? "placeholder" : "ok";
}

export function brandGaps(brand: Partial<Brand> | null | undefined) {
  const placeholder: string[] = [];
  const empty: string[] = [];
  if (!brand) return { placeholder, empty };
  for (const field of BRAND_CONTEXT_FIELDS) {
    const state = brandFieldState(brand, field.keys);
    if (state === "placeholder") placeholder.push(field.label);
    if (state === "empty") empty.push(field.label);
  }
  return { placeholder, empty };
}

/** Plain-words reason shown on the Agents board when a safety check stops a campaign run. */
export function safetyBlockReason(kind: "content" | "visual", score: number, brand: Partial<Brand> | null | undefined) {
  const { placeholder } = brandGaps(brand);
  const name = brand?.name ?? "the brand";
  if (placeholder.length) {
    return `Blocked by safety check: brand details are still placeholder (score ${score}/100). Fill in Brands → ${name}.`;
  }
  return kind === "visual"
    ? `Blocked by safety check: the image concept failed the visual safety review (score ${score}/100). No image was made.`
    : `Blocked by safety check: the draft made claims the reviewer could not verify (score ${score}/100). Nothing was packaged.`;
}
