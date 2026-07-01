// Platform requirements — the source of truth for "platform-native". A campaign idea fans out into
// one package PER platform, and each package must satisfy its platform's spec before it can be
// approved/posted. Finalized asset rules (operator): LinkedIn + X = text + image (video on demand);
// Instagram = carousel 3-7 slides (video + music on demand); TikTok + Facebook = short video +
// music + text. Adjust freely here — the validator reads these.

export type PlatformKey = "linkedin" | "x" | "instagram" | "tiktok" | "facebook" | "blog";

export type PlatformSpec = {
  label: string;
  contentTypes: string[];
  requiredText: Array<"hook" | "body" | "cta">;
  maxChars?: number; // hard cap on the main post text (single post)
  requiresImage?: boolean; // a generated image is mandatory (blocker)
  requiresVideo?: boolean; // a video (script + storyboard + asset) is mandatory (blocker)
  recommendsVideo?: boolean; // video lifts performance but isn't a hard block (warning)
  carousel?: { minSlides: number; maxSlides: number; required?: boolean };
  rejects: string;
};

export const PLATFORM_SPECS: Record<PlatformKey, PlatformSpec> = {
  linkedin: {
    label: "LinkedIn",
    contentTypes: ["text post", "image post", "document/carousel"],
    requiredText: ["hook", "body", "cta"],
    requiresImage: true,
    rejects: "Generic copy without a hook; image-less posts."
  },
  x: {
    label: "X",
    contentTypes: ["short post", "thread"],
    requiredText: ["body"],
    maxChars: 280,
    requiresImage: true,
    rejects: "Long LinkedIn-style essays; single posts over 280 chars."
  },
  instagram: {
    label: "Instagram",
    contentTypes: ["carousel", "reel", "image post"],
    requiredText: ["body", "cta"],
    carousel: { minSlides: 3, maxSlides: 7, required: true },
    recommendsVideo: true,
    rejects: "A single weak generic image; carousels under 3 slides; missing CTA."
  },
  tiktok: {
    label: "TikTok",
    contentTypes: ["video"],
    requiredText: ["hook", "body"],
    requiresVideo: true,
    rejects: "Text/image-only packages; no video script + storyboard + asset."
  },
  facebook: {
    label: "Facebook",
    contentTypes: ["short video", "image/text/link post"],
    requiredText: ["body", "cta"],
    requiresVideo: true,
    rejects: "Empty caption; no short video."
  },
  blog: {
    label: "Blog",
    contentTypes: ["article"],
    requiredText: ["body"],
    rejects: "Thin content with no structure."
  }
};

export function resolvePlatform(platform: string): PlatformKey | null {
  const k = (platform || "").toLowerCase();
  if (k.includes("linkedin")) return "linkedin";
  if (k === "x" || k.includes("twitter")) return "x";
  if (k.includes("instagram")) return "instagram";
  if (k.includes("tiktok")) return "tiktok";
  if (k.includes("facebook")) return "facebook";
  if (k.includes("blog")) return "blog";
  return null;
}

// Region-aware scheduling presets. Crina picks a window per audience/platform; the scheduler maps
// the chosen window to a concrete time in the region's timezone.
export type RegionKey = "us" | "europe" | "gulf" | "asia";

export const REGION_PRESETS: Record<RegionKey, { label: string; timezone: string; windows: string[] }> = {
  us: { label: "US", timezone: "America/New_York", windows: ["08:00-10:00", "12:00-13:00", "16:00-18:00"] },
  europe: { label: "Europe", timezone: "Europe/Berlin", windows: ["08:00-10:00", "12:00-14:00"] },
  gulf: { label: "Gulf", timezone: "Asia/Dubai", windows: ["09:00-11:00", "14:00-16:00", "19:00-21:00"] },
  asia: { label: "Asia", timezone: "Asia/Singapore", windows: ["09:00-11:00", "14:00-16:00", "19:00-21:00"] }
};
