import { PLATFORM_SPECS, resolvePlatform, type PlatformKey } from "@/lib/marketing/platform-specs";

// Per-platform generation plans. A campaign idea fans out into ONE native package per platform:
// the content prompt, output schema, content_type, and asset strategy all differ by platform.
// LinkedIn = long investor post + image; X = <=280 + image; Instagram = carousel; TikTok/Facebook =
// short-video script + storyboard (asset comes from the video pipeline, pending).

export type NativeDraft = {
  title: string;
  hook: string;
  body: string; // main text / caption
  cta: string;
  hashtags: string[];
  slides?: { headline: string; text: string }[]; // Instagram carousel
  script?: string; // TikTok / Facebook video
  storyboard?: string[];
};

export type AssetKind = "image" | "carousel" | "video";

export type PlatformPlan = {
  key: PlatformKey | null;
  label: string;
  contentType: string;
  assetKind: AssetKind;
  carouselCount: number;
  contentInstructions: string;
  contentSchema: Record<string, unknown>;
  normalize: (json: unknown) => NativeDraft | null;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
const promptLeak = /\b(make this visual|not a 2d|use a hyper-realistic|text on image|visual direction|image prompt|carousel draft|slide\s+\d+\s*:|create a\s+\d+-slide|overlay text)\b/i;

function normalizePost(json: unknown): NativeDraft | null {
  const d = (json ?? {}) as Record<string, unknown>;
  const body = str(d.body) || str(d.text) || str(d.caption);
  if (!body) return null;
  return { title: str(d.title) || "Post", hook: str(d.hook), body, cta: str(d.cta) || str(d.CTA) || "Learn more", hashtags: list(d.hashtags).slice(0, 8) };
}

function normalizeCarousel(json: unknown): NativeDraft | null {
  const d = (json ?? {}) as Record<string, unknown>;
  const caption = str(d.caption) || str(d.body);
  const raw = Array.isArray(d.slides) ? d.slides : [];
  const slides = raw
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { headline: str(o.headline) || str(o.title), text: str(o.text) || str(o.body) };
    })
    .filter((s) => s.headline || s.text);
  const cleanSlides = slides.filter((s) => !promptLeak.test(`${s.headline}\n${s.text}`));
  if (!caption || promptLeak.test(caption) || cleanSlides.length < 3) return null;
  return { title: str(d.title) || "Carousel", hook: str(d.hook) || cleanSlides[0]?.headline || "", body: caption, cta: str(d.cta) || "Learn more", hashtags: list(d.hashtags).slice(0, 10), slides: cleanSlides.slice(0, 7) };
}

function normalizeVideo(json: unknown): NativeDraft | null {
  const d = (json ?? {}) as Record<string, unknown>;
  const script = str(d.script) || str(d.body);
  if (!script) return null;
  return { title: str(d.title) || "Short video", hook: str(d.hook), body: str(d.caption) || script.slice(0, 220), cta: str(d.cta) || "Learn more", hashtags: list(d.hashtags).slice(0, 8), script, storyboard: list(d.storyboard).slice(0, 8) };
}

const postSchema = { title: "short name", hook: "scroll-stopping first line", body: "platform-tailored post text", cta: "one clear CTA", hashtags: ["#tag"] };
const carouselSchema = { title: "short name", hook: "short first-slide hook", caption: "final Instagram caption only, not slide instructions", cta: "one clear CTA", hashtags: ["#tag"], slides: [{ headline: "audience-facing slide headline", text: "1-2 short audience-facing slide lines" }] };
const videoSchema = { title: "short name", hook: "first-2-seconds hook", script: "spoken ~20s voiceover script", storyboard: ["shot 1", "shot 2", "shot 3"], caption: "post caption", cta: "one clear CTA", hashtags: ["#tag"] };

export function getPlatformPlan(platform: string): PlatformPlan {
  const key = resolvePlatform(platform);
  const raw = platform.toLowerCase();
  const label = key ? PLATFORM_SPECS[key].label : platform;
  if (key === "instagram" && raw.includes("image")) {
    return {
      key,
      label: "Instagram image test",
      contentType: "Image post",
      assetKind: "image",
      carouselCount: 0,
      contentInstructions: "Write ONE Instagram image-post caption for a deliberate image+text test. Strong first line, concrete value, compact body, clear CTA, and 5-8 relevant hashtags. This is not the default IG carousel/reel path.",
      contentSchema: postSchema,
      normalize: normalizePost
    };
  }
  switch (key) {
    case "x":
      return { key, label, contentType: "Short post", assetKind: "image", carouselCount: 0, contentInstructions: "Write ONE X (Twitter) post: punchy, MAX 280 characters, a strong first line, at most 2 hashtags. NOT a LinkedIn essay — short and sharp.", contentSchema: postSchema, normalize: normalizePost };
    case "instagram":
      return { key, label, contentType: "Carousel", assetKind: "carousel", carouselCount: 5, contentInstructions: "Design an Instagram CAROUSEL as final audience-facing copy: a caption plus exactly 5 slides. Slide 1 = a sharp conversion hook cover; slides 2-4 = value/proof/diligence questions; slide 5 = CTA. Each slide has a short headline + 1-2 short lines. Return slides[] only as final slide copy. Do NOT put image prompts, visual directions, 'text on image', 'make this visual', or 'Instagram carousel draft' language in caption or slides.", contentSchema: carouselSchema, normalize: normalizeCarousel };
    case "tiktok":
      return { key, label, contentType: "Short video", assetKind: "video", carouselCount: 0, contentInstructions: "Plan a TikTok short video: a hook in the first 2 seconds, a spoken ~20s script, and a 3-5 shot storyboard. Add a caption + CTA. Native, fast, punchy — no LinkedIn tone.", contentSchema: videoSchema, normalize: normalizeVideo };
    case "facebook":
      return { key, label, contentType: "Short video", assetKind: "video", carouselCount: 0, contentInstructions: "Plan a Facebook short video: a hook, a ~20s script, a 3-5 shot storyboard, and a caption + CTA.", contentSchema: videoSchema, normalize: normalizeVideo };
    case "blog":
      return { key, label, contentType: "Blog article", assetKind: "image", carouselCount: 0, contentInstructions: "Write a search-intent blog article: a title, an intro hook, a structured scannable body, and a CTA.", contentSchema: postSchema, normalize: normalizePost };
    case "linkedin":
    default:
      return { key: key ?? null, label, contentType: "Social post", assetKind: "image", carouselCount: 0, contentInstructions: "Write ONE LinkedIn post: investor/decision-maker grade. A serious, specific hook; a substantive, credible body; a low-friction CTA. Professional, not generic.", contentSchema: postSchema, normalize: normalizePost };
  }
}
