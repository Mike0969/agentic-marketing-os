import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createProjectAsset, listProjectAssets, type AssetFilters } from "@/lib/marketing/project-assets";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { AssetSourceTool, ProjectAssetType, ProjectSlug } from "@/lib/types";

export const dynamic = "force-dynamic";

const SLUGS: ProjectSlug[] = ["gridfactory", "gulf_el_nexride"];
const TYPES: ProjectAssetType[] = ["image", "video", "carousel", "deck", "pdf", "script", "note", "logo", "reference", "other"];
const TOOLS: AssetSourceTool[] = ["manual_upload", "google_flow", "veo", "higgsfield", "sora", "runway", "canva", "other"];

function inferAssetType(input: { requested: string | null; fileName?: string | null; mime?: string | null; fileUrl?: string | null }): ProjectAssetType {
  if (input.requested && input.requested !== "image" && TYPES.includes(input.requested as ProjectAssetType)) return input.requested as ProjectAssetType;
  const hint = `${input.mime ?? ""} ${input.fileName ?? ""} ${input.fileUrl ?? ""}`.toLowerCase();
  if (hint.includes("application/pdf") || hint.endsWith(".pdf") || hint.includes(".pdf?")) return "pdf";
  if (hint.includes("video/") || /\.(mp4|mov|webm|m4v)(\?|$)/.test(hint)) return "video";
  if (hint.includes("presentation") || /\.(ppt|pptx|key)(\?|$)/.test(hint)) return "deck";
  if (hint.includes("image/") || /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/.test(hint)) return "image";
  return TYPES.includes(input.requested as ProjectAssetType) ? (input.requested as ProjectAssetType) : "other";
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const url = new URL(request.url);
  const filters: AssetFilters = {};
  const slug = url.searchParams.get("project_slug");
  if (slug && SLUGS.includes(slug as ProjectSlug)) filters.projectSlug = slug as ProjectSlug;
  const platform = url.searchParams.get("platform");
  if (platform) filters.platform = platform;
  const type = url.searchParams.get("asset_type");
  if (type) filters.assetType = type;
  if (url.searchParams.get("approved") === "true") filters.approved = true;
  if (url.searchParams.get("mandatory") === "true") filters.mandatory = true;
  if (url.searchParams.get("reuse_allowed") === "true") filters.reuseAllowed = true;
  const assets = await listProjectAssets(filters);
  return NextResponse.json({ assets });
}

// Upload an asset (multipart/form-data with an optional file) or register an external asset URL.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });

  const slug = String(form.get("project_slug") ?? "");
  if (!SLUGS.includes(slug as ProjectSlug)) return NextResponse.json({ error: "A valid project_slug is required." }, { status: 400 });

  const str = (k: string) => { const v = form.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
  const bool = (k: string) => form.get(k) === "true" || form.get(k) === "on";
  const list = (k: string) => (str(k) ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  let fileUrl = str("file_url");
  const file = form.get("file");
  let uploadedFileName: string | null = null;
  let uploadedMime: string | null = null;
  if (file && file instanceof File && file.size > 0) {
    uploadedFileName = file.name;
    uploadedMime = file.type || null;
    const supabase = createServiceClient();
    if (!supabase) return NextResponse.json({ error: "Storage not available." }, { status: 503 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-60) || "asset";
    const path = `projects/${slug}/${randomUUID()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage.from("marketing-assets").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    fileUrl = supabase.storage.from("marketing-assets").getPublicUrl(path).data.publicUrl;
  }

  if (!fileUrl) return NextResponse.json({ error: "Provide a file or a file_url." }, { status: 400 });

  const assetType = str("asset_type");
  const sourceTool = str("source_tool");
  const qs = Number(str("quality_score") ?? "0");
  const inferredAssetType = inferAssetType({ requested: assetType, fileName: uploadedFileName, mime: uploadedMime, fileUrl });

  const asset = await createProjectAsset({
    project_slug: slug as ProjectSlug,
    brand_id: str("brand_id"),
    file_url: fileUrl,
    asset_type: inferredAssetType,
    title: str("title") ?? uploadedFileName ?? "Untitled asset",
    description: str("description"),
    tags: list("tags"),
    platform_fit: list("platform_fit"),
    content_theme: str("content_theme"),
    visual_style: str("visual_style"),
    quality_score: Number.isFinite(qs) ? Math.max(0, Math.min(100, Math.round(qs))) : 0,
    reuse_allowed: form.has("reuse_allowed") ? bool("reuse_allowed") : true,
    mandatory: bool("mandatory"),
    approved: bool("approved"),
    source_tool: (TOOLS.includes(sourceTool as AssetSourceTool) ? sourceTool : "manual_upload") as AssetSourceTool,
    rights_status: str("rights_status")
  });

  if (!asset) return NextResponse.json({ error: "Could not save asset." }, { status: 500 });
  revalidatePath("/marketing/assets");
  return NextResponse.json({ asset });
}
