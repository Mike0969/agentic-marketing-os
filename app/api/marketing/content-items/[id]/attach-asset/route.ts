import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PLATFORM_SPECS, resolvePlatform } from "@/lib/marketing/platform-specs";
import { recordAssetUsage } from "@/lib/marketing/project-assets";
import { saveContentAssets } from "@/lib/marketing/ready-package";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentItem, ProjectAsset, ReadyPackage, ReadyPackageAsset } from "@/lib/types";

const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

// Attach a Project Asset Library item to a content item's ready package. Video-aware: attaching a
// real video to a video-required post unblocks the validator (video_status = draft_asset).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { asset_id?: unknown } | null;
  const assetId = typeof body?.asset_id === "string" ? body.asset_id : null;
  if (!assetId) return NextResponse.json({ error: "asset_id is required." }, { status: 400 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Storage not available." }, { status: 503 });

  const { data: itemRow } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
  const item = itemRow as ContentItem | null;
  if (!item) return NextResponse.json({ error: "Content item not found." }, { status: 404 });

  const { data: assetRow } = await supabase.from("project_assets").select("*").eq("id", assetId).maybeSingle();
  const asset = assetRow as ProjectAsset | null;
  if (!asset || !asset.file_url) return NextResponse.json({ error: "Asset not found or has no file." }, { status: 404 });

  const platformKey = resolvePlatform(item.platform || "");
  const requiresVideo = platformKey ? PLATFORM_SPECS[platformKey].requiresVideo === true : false;
  const assetIsVideo = asset.asset_type === "video" || VIDEO_RE.test(asset.file_url);
  const asVideo = assetIsVideo || requiresVideo;

  const newAsset: ReadyPackageAsset = {
    kind: asVideo ? "video_placeholder" : "image",
    url: asset.file_url,
    prompt: asset.description ?? asset.title,
    position: 1,
    status: "generated",
    provider: `library:${asset.source_tool}`
  };

  const pkg = (item.ready_package ?? {}) as ReadyPackage;
  const updatedPkg: ReadyPackage = {
    ...pkg,
    assets: [newAsset],
    asset_source: "library",
    selected_asset_id: asset.id,
    selected_asset_title: asset.title,
    project_slug: asset.project_slug,
    reuse_allowed: asset.reuse_allowed,
    crina_route_notes: `Operator attached library ${asset.asset_type} "${asset.title}" to ${item.platform}.`,
    ...(asVideo ? { video_status: "draft_asset" as const } : {})
  };

  const { error: updErr } = await supabase
    .from("content_items")
    .update({ visual_asset_url: asset.file_url, visual_asset_status: "generated", ready_package: updatedPkg })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await saveContentAssets(id, [newAsset]);
  await recordAssetUsage({ assetId: asset.id, contentItemId: id, campaignId: item.campaign_id, platform: item.platform, reused: asset.used_count > 0 });

  const { data: updated } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
  revalidatePath("/marketing/ready-to-post");
  return NextResponse.json({ contentItem: updated as ContentItem, asset });
}
