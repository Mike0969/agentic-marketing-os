import { PLATFORM_SPECS, resolvePlatform } from "@/lib/marketing/platform-specs";
import type { ContentItem, ReadyPackage } from "@/lib/types";

// Structural quality gate: is this package platform-native and asset-complete? Runs before an item
// can be approved/posted. (Brand-fit / conversion quality is judged separately by Crina's rubric.)
// Pure + client-safe.

export type ValidationIssue = { severity: "blocker" | "warning"; message: string };
export type ValidationResult = { ok: boolean; platform: string | null; issues: ValidationIssue[] };

export function validatePackage(item: ContentItem): ValidationResult {
  const key = resolvePlatform(item.platform || "");
  if (!key) return { ok: true, platform: null, issues: [{ severity: "warning", message: `No platform spec for "${item.platform}".` }] };

  const spec = PLATFORM_SPECS[key];
  const pkg = (item.ready_package ?? {}) as ReadyPackage;
  const issues: ValidationIssue[] = [];
  const contentType = (item.content_type || "").toLowerCase();

  const text = (pkg.text || item.body || "").trim();
  const cta = (item.CTA || "").trim();

  if (spec.requiredText.includes("hook") && !(item.hook || "").trim()) issues.push({ severity: "blocker", message: "Missing hook." });
  if (spec.requiredText.includes("body") && !text) issues.push({ severity: "blocker", message: "Missing post text." });
  if (spec.requiredText.includes("cta") && !cta) issues.push({ severity: "blocker", message: "Missing CTA." });

  if (spec.maxChars && text.length > spec.maxChars) {
    issues.push({ severity: "blocker", message: `Text exceeds ${spec.maxChars} chars (${text.length}).` });
  }

  const assets = pkg.assets ?? [];
  const hasImage = Boolean(item.visual_asset_url && item.visual_asset_status === "generated") || assets.some((a) => a.kind === "image" && a.url && a.status === "generated");
  const slideCount = assets.filter((a) => a.kind === "carousel_slide" && a.url).length;
  const hasVideo = pkg.video_status === "draft_asset" || assets.some((a) => a.kind === "video_placeholder" && a.url && a.status === "generated");

  if (spec.requiresImage && !hasImage) issues.push({ severity: "blocker", message: `${spec.label} requires an image.` });
  if (key === "instagram" && contentType.includes("image") && !hasImage) issues.push({ severity: "blocker", message: "Instagram image test requires an image." });

  if (spec.carousel?.required && contentType.includes("carousel")) {
    if (slideCount < spec.carousel.minSlides) {
      issues.push({ severity: "blocker", message: `Carousel needs ${spec.carousel.minSlides}-${spec.carousel.maxSlides} slides (has ${slideCount}).` });
    } else if (slideCount > spec.carousel.maxSlides) {
      issues.push({ severity: "warning", message: `Carousel has ${slideCount} slides (max ${spec.carousel.maxSlides}).` });
    }
  }

  if (spec.requiresVideo && !hasVideo) issues.push({ severity: "blocker", message: `${spec.label} requires a video (script + storyboard + asset). Video pipeline pending.` });
  else if (spec.recommendsVideo && !hasVideo) issues.push({ severity: "warning", message: `${spec.label} performs best with a video — none attached.` });

  return { ok: !issues.some((i) => i.severity === "blocker"), platform: spec.label, issues };
}
