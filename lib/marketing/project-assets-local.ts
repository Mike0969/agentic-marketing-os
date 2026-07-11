// Local-folder backend for the Project Asset Library — used when Supabase is not
// configured (local mode) so the inspiration library still works: the operator
// drops their own videos/visuals into `public/inspiration/<project_slug>/` and the
// agents search them exactly like the cloud library, honoring the same reuse rule
// (never the same asset twice on the same platform; single-use assets once total).
//
// Storage: media lives under `public/inspiration/<slug>/` (served by Next at
// `/inspiration/...`). The manifest + usage log live in `data/project-assets.json`.
// Dropping a file is enough — reads lazily scan the folder and self-register new files.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { selectAssetCandidates } from "@/lib/marketing/asset-reuse-policy";
import type { AssetFilters } from "@/lib/marketing/project-assets";
import type { ProjectAsset, ProjectAssetType, ProjectSlug } from "@/lib/types";

const SLUGS: ProjectSlug[] = ["gridfactory", "gulf_el_nexride"];
const dataDir = path.join(process.cwd(), "data");
const manifestFile = path.join(dataDir, "project-assets.json");
const mediaRoot = path.join(process.cwd(), "public", "inspiration");

export type AssetUsage = { id: string; asset_id: string; content_item_id: string | null; campaign_id: string | null; platform: string | null; reused: boolean; created_at: string };
type Manifest = { assets: ProjectAsset[]; usages: AssetUsage[] };

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const DECK_EXT = new Set([".ppt", ".pptx", ".key"]);
const MEDIA_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT, ...DECK_EXT, ".pdf"]);

function assetTypeFromExt(ext: string): ProjectAssetType {
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  if (DECK_EXT.has(ext)) return "deck";
  if (ext === ".pdf") return "pdf";
  return "other";
}

// Deterministic id from the file's project-relative path so re-scans are idempotent.
function idForPath(relPath: string): string {
  return createHash("sha1").update(relPath).digest("hex").slice(0, 32);
}

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await readFile(manifestFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    return { assets: parsed.assets ?? [], usages: parsed.usages ?? [] };
  } catch {
    return { assets: [], usages: [] };
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(manifestFile, JSON.stringify(m, null, 2));
}

// Filename convention for zero-config tagging:
//   `linkedin+x__My Clip.mp4`  → platform_fit ["linkedin","x"], title "My Clip"
//   `My Clip.mp4`              → platform_fit ["all"]
// An optional sidecar `<file>.json` overrides any field (platform_fit, reuse_allowed,
// mandatory, approved, title, description, visual_style, content_theme, quality_score).
function parseName(fileName: string): { platform_fit: string[]; title: string } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const sep = base.indexOf("__");
  if (sep > 0) {
    const platforms = base.slice(0, sep).split("+").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const title = base.slice(sep + 2).trim() || fileName;
    return { platform_fit: platforms.length ? platforms : ["all"], title };
  }
  return { platform_fit: ["all"], title: base || fileName };
}

async function readSidecar(fullPath: string): Promise<Partial<ProjectAsset> | null> {
  try {
    const raw = await readFile(`${fullPath}.json`, "utf8");
    return JSON.parse(raw) as Partial<ProjectAsset>;
  } catch {
    return null;
  }
}

// Scan `public/inspiration/<slug>/` and register any media files not already in the
// manifest. Idempotent: existing assets (by path-derived id) are left untouched, so
// operator edits (approve, tags, quality) persist across scans. Returns the manifest.
export async function scanInspirationFolder(): Promise<Manifest> {
  const manifest = await readManifest();
  const known = new Set(manifest.assets.map((a) => a.id));
  let changed = false;

  for (const slug of SLUGS) {
    const dir = path.join(mediaRoot, slug);
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // folder not created yet
    }
    for (const name of entries) {
      if (name.startsWith(".") || name.endsWith(".json")) continue;
      const ext = path.extname(name).toLowerCase();
      if (!MEDIA_EXT.has(ext)) continue;
      const fullPath = path.join(dir, name);
      try {
        if (!(await stat(fullPath)).isFile()) continue;
      } catch {
        continue;
      }
      const relPath = path.posix.join("inspiration", slug, name);
      const id = idForPath(relPath);
      if (known.has(id)) continue;

      const { platform_fit, title } = parseName(name);
      const sidecar = await readSidecar(fullPath);
      const now = new Date().toISOString();
      manifest.assets.push({
        id,
        project_slug: slug,
        brand_id: sidecar?.brand_id ?? null,
        file_url: `/${relPath}`,
        asset_type: sidecar?.asset_type ?? assetTypeFromExt(ext),
        title: sidecar?.title ?? title,
        description: sidecar?.description ?? null,
        tags: sidecar?.tags ?? [],
        platform_fit: sidecar?.platform_fit?.length ? sidecar.platform_fit : platform_fit,
        content_theme: sidecar?.content_theme ?? null,
        visual_style: sidecar?.visual_style ?? null,
        quality_score: sidecar?.quality_score ?? 0,
        // The operator's own uploads are inspiration they chose — usable by default.
        reuse_allowed: sidecar?.reuse_allowed ?? true,
        mandatory: sidecar?.mandatory ?? false,
        approved: sidecar?.approved ?? true,
        source_tool: sidecar?.source_tool ?? "manual_upload",
        rights_status: sidecar?.rights_status ?? "owned",
        transcript: sidecar?.transcript ?? null,
        extracted_text: sidecar?.extracted_text ?? null,
        used_count: 0,
        last_used_at: null,
        created_at: now,
        updated_at: now
      });
      known.add(id);
      changed = true;
    }
  }

  if (changed) await writeManifest(manifest);
  return manifest;
}

function fitsPlatform(asset: ProjectAsset, platform: string): boolean {
  const p = platform.toLowerCase();
  return asset.platform_fit.some((x) => x === p || x === "all");
}

// ---- Public API (matches project-assets.ts signatures) ------------------------

export async function listLocalAssets(filters: AssetFilters = {}): Promise<ProjectAsset[]> {
  const manifest = await scanInspirationFolder();
  let assets = manifest.assets;
  if (filters.projectSlug) assets = assets.filter((a) => a.project_slug === filters.projectSlug);
  if (filters.assetType) assets = assets.filter((a) => a.asset_type === filters.assetType);
  if (typeof filters.approved === "boolean") assets = assets.filter((a) => a.approved === filters.approved);
  if (typeof filters.mandatory === "boolean") assets = assets.filter((a) => a.mandatory === filters.mandatory);
  if (typeof filters.reuseAllowed === "boolean") assets = assets.filter((a) => a.reuse_allowed === filters.reuseAllowed);
  if (filters.platform) assets = assets.filter((a) => fitsPlatform(a, filters.platform as string));
  return [...assets].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export async function findLocalAssetCandidates(args: { projectSlug: ProjectSlug; platform: string; limit?: number }): Promise<ProjectAsset[]> {
  const manifest = await scanInspirationFolder();
  const eligible = manifest.assets.filter((a) => a.project_slug === args.projectSlug && a.approved && fitsPlatform(a, args.platform));
  return selectAssetCandidates(eligible, manifest.usages, args.platform, args.limit ?? 6);
}

export async function createLocalAsset(input: Partial<ProjectAsset> & { project_slug: ProjectSlug }): Promise<ProjectAsset | null> {
  const manifest = await readManifest();
  const now = new Date().toISOString();
  const asset: ProjectAsset = {
    id: input.id ?? idForPath(`registered/${input.file_url ?? now}-${Math.random()}`),
    project_slug: input.project_slug,
    brand_id: input.brand_id ?? null,
    file_url: input.file_url ?? null,
    asset_type: input.asset_type ?? "image",
    title: input.title ?? "Untitled asset",
    description: input.description ?? null,
    tags: input.tags ?? [],
    platform_fit: input.platform_fit?.length ? input.platform_fit : ["all"],
    content_theme: input.content_theme ?? null,
    visual_style: input.visual_style ?? null,
    quality_score: input.quality_score ?? 0,
    reuse_allowed: input.reuse_allowed ?? true,
    mandatory: input.mandatory ?? false,
    approved: input.approved ?? false,
    source_tool: input.source_tool ?? "manual_upload",
    rights_status: input.rights_status ?? null,
    transcript: input.transcript ?? null,
    extracted_text: input.extracted_text ?? null,
    used_count: 0,
    last_used_at: null,
    created_at: now,
    updated_at: now
  };
  manifest.assets.push(asset);
  await writeManifest(manifest);
  return asset;
}

export async function recordLocalAssetUsage(args: { assetId: string; contentItemId?: string | null; campaignId?: string | null; platform?: string | null; reused?: boolean }): Promise<void> {
  const manifest = await readManifest();
  manifest.usages.push({
    id: idForPath(`usage/${args.assetId}/${Date.now()}/${Math.random()}`),
    asset_id: args.assetId,
    content_item_id: args.contentItemId ?? null,
    campaign_id: args.campaignId ?? null,
    platform: args.platform ? args.platform.toLowerCase() : null,
    reused: args.reused ?? false,
    created_at: new Date().toISOString()
  });
  const asset = manifest.assets.find((a) => a.id === args.assetId);
  if (asset) {
    asset.used_count = (asset.used_count ?? 0) + 1;
    asset.last_used_at = new Date().toISOString();
    asset.updated_at = asset.last_used_at;
  }
  await writeManifest(manifest);
}
