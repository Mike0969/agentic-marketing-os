import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentAsset, ContentItem, ReadyPackage, ReadyPackageAsset } from "@/lib/types";

export type ReadyPackageOutput = {
  text: string;
  title?: string;
  meta_description?: string;
  body?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  alt_text?: string;
  suggested_post_time?: string;
  asset_checklist?: string[];
  script?: string;
  storyboard?: string[];
};

export const readyPackageSchema = {
  text: "Final platform-ready text. X must be 280 characters or less.",
  title: "Blog title or optional social display title.",
  meta_description: "Blog meta description when relevant.",
  body: "Blog/article body when relevant.",
  caption: "Instagram/Facebook caption when relevant.",
  hashtags: ["Relevant, conservative hashtags."],
  mentions: ["Optional account mentions; leave empty unless explicitly known."],
  alt_text: "Accessible image alt text.",
  suggested_post_time: "Suggested manual posting time with timezone.",
  asset_checklist: ["Manual checks before posting."],
  script: "Instagram video script when relevant.",
  storyboard: ["Instagram video storyboard beat when relevant."]
};

function platform(item: ContentItem) {
  return item.platform.toLowerCase();
}

export function assetKindFor(item: ContentItem): ReadyPackageAsset["kind"] {
  const raw = `${item.platform} ${item.content_type}`.toLowerCase();
  if (raw.includes("carousel")) return "carousel_slide";
  if (raw.includes("video")) return "cover_frame";
  return "image";
}

export function desiredAssetCount(item: ContentItem) {
  const raw = `${item.platform} ${item.content_type}`.toLowerCase();
  if (raw.includes("carousel")) return 5;
  return 1;
}

export function normalizeReadyPackage(value: unknown, item: ContentItem, fallback = false): ReadyPackage {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const isX = platform(item) === "x" || platform(item).includes("twitter");
  const isBlog = platform(item).includes("blog") || item.content_type.toLowerCase().includes("article");
  const isVideo = `${item.platform} ${item.content_type}`.toLowerCase().includes("video");
  const text = typeof raw.text === "string" && raw.text.trim() ? raw.text.trim() : item.body || item.hook || item.title;
  const trimmedText = isX && text.length > 280 ? `${text.slice(0, 276).trim()}...` : text;

  return {
    platform: item.platform,
    content_type: item.content_type,
    text: trimmedText,
    title: typeof raw.title === "string" ? raw.title : isBlog ? item.title : undefined,
    meta_description: typeof raw.meta_description === "string" ? raw.meta_description : isBlog ? item.hook.slice(0, 155) : undefined,
    body: typeof raw.body === "string" ? raw.body : isBlog ? item.body : undefined,
    caption: typeof raw.caption === "string" ? raw.caption : platform(item).includes("instagram") || platform(item).includes("facebook") ? trimmedText : undefined,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.map(String).slice(0, 8) : [],
    mentions: Array.isArray(raw.mentions) ? raw.mentions.map(String).slice(0, 5) : [],
    alt_text: typeof raw.alt_text === "string" ? raw.alt_text : `Visual support for ${item.title}`,
    suggested_post_time: typeof raw.suggested_post_time === "string" ? raw.suggested_post_time : "Manual review required before posting.",
    asset_checklist: Array.isArray(raw.asset_checklist) ? raw.asset_checklist.map(String).slice(0, 8) : ["Verify claims", "Check image crop", "Confirm CTA"],
    script: typeof raw.script === "string" ? raw.script : isVideo ? item.body : undefined,
    storyboard: Array.isArray(raw.storyboard) ? raw.storyboard.map(String).slice(0, 8) : isVideo ? ["Hook", "Proof point", "CTA"] : undefined,
    video_status: isVideo ? "coming_soon" : undefined,
    fallback_used: fallback
  };
}

export async function saveContentAssets(contentItemId: string, assets: ReadyPackageAsset[], options: { replace?: boolean } = {}) {
  if (!isSupabaseConfigured()) return [] as ContentAsset[];
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase || !assets.length) return [] as ContentAsset[];

  if (options.replace ?? true) {
    await supabase.from("content_assets").delete().eq("content_item_id", contentItemId);
  } else {
    const positions = assets.map((asset, index) => asset.position ?? index + 1);
    await supabase.from("content_assets").delete().eq("content_item_id", contentItemId).in("position", positions);
  }
  const { data } = await supabase
    .from("content_assets")
    .insert(
      assets.map((asset, index) => ({
        content_item_id: contentItemId,
        kind: asset.kind,
        url: asset.url ?? null,
        prompt: asset.prompt ?? null,
        position: asset.position ?? index + 1,
        model: asset.model ?? null,
        provider: asset.provider ?? null,
        status: asset.status ?? "placeholder",
        error: asset.error ?? null
      }))
    )
    .select("*");

  return (data ?? []) as ContentAsset[];
}

export async function getContentAssets(contentItemIds: string[]) {
  if (!isSupabaseConfigured() || !contentItemIds.length) return [] as ContentAsset[];
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return [] as ContentAsset[];

  const { data, error } = await supabase
    .from("content_assets")
    .select("*")
    .in("content_item_id", contentItemIds)
    .order("position", { ascending: true });

  if (error) return [];
  return (data ?? []) as ContentAsset[];
}
