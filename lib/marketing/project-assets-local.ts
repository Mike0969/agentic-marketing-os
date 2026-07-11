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
import { mkdir, readFile, readdir, rename, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { selectAssetCandidates } from "@/lib/marketing/asset-reuse-policy";
import type { AssetFilters } from "@/lib/marketing/project-assets";
import type { ProjectAsset, ProjectAssetType, ProjectSlug } from "@/lib/types";

const SLUGS: ProjectSlug[] = ["gridfactory", "gulf_el_nexride"];
const ASSET_TYPES: ProjectAssetType[] = ["image", "video", "carousel", "deck", "pdf", "script", "note", "logo", "reference", "other"];
const CLOUD_POOL_CAP = 24; // must match the Supabase query .limit(24) so cloud/local pick identically
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

// Deterministic id from the file's project-relative path so re-scans are idempotent
// and an uploaded file keeps ONE identity across scans (no duplicate records).
function idForPath(relPath: string): string {
  return createHash("sha1").update(relPath).digest("hex").slice(0, 32);
}

// ---- Serialized, atomic persistence (C3) --------------------------------------
// Local mode is a single Next process; an in-process promise chain serializes every
// read-modify-write so concurrent scans/usages can't clobber each other. Writes go to
// a temp file then rename (atomic; never a torn manifest). A manifest that exists but
// fails to parse is an ERROR, never silently treated as empty (which would then be
// overwritten, losing all assets + usage history and breaking the reuse guarantee).
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(() => undefined, () => undefined);
  return run;
}

async function readManifest(): Promise<Manifest> {
  let raw: string;
  try {
    raw = await readFile(manifestFile, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { assets: [], usages: [] };
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    return { assets: parsed.assets ?? [], usages: parsed.usages ?? [] };
  } catch {
    throw new Error(`project-assets manifest is corrupt: ${manifestFile}. Refusing to overwrite; fix or delete it.`);
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmp = path.join(dataDir, `.project-assets.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(m, null, 2));
  await rename(tmp, manifestFile);
}

// ---- Sidecar validation (C5) --------------------------------------------------
// Sidecars are operator-authored JSON; a wrong shape (e.g. platform_fit as a string)
// must NOT poison the manifest and throw on later reads. Coerce/validate every field;
// silently drop anything invalid.
function toStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return undefined;
}
function normalizeSidecar(raw: unknown): Partial<ProjectAsset> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ProjectAsset> = {};
  const platform_fit = toStringArray(r.platform_fit);
  if (platform_fit?.length) out.platform_fit = platform_fit;
  const tags = toStringArray(r.tags);
  if (tags) out.tags = tags;
  if (typeof r.asset_type === "string" && ASSET_TYPES.includes(r.asset_type as ProjectAssetType)) out.asset_type = r.asset_type as ProjectAssetType;
  for (const k of ["title", "description", "visual_style", "content_theme", "rights_status", "transcript", "extracted_text", "brand_id"] as const) {
    if (typeof r[k] === "string") out[k] = r[k] as string;
  }
  for (const k of ["reuse_allowed", "mandatory", "approved"] as const) {
    if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  }
  if (typeof r.quality_score === "number" && Number.isFinite(r.quality_score)) {
    out.quality_score = Math.max(0, Math.min(100, Math.round(r.quality_score)));
  }
  return out;
}

// Filename convention for zero-config tagging:
//   `linkedin+x__My Clip.mp4`  → platform_fit ["linkedin","x"], title "My Clip"
//   `My Clip.mp4`              → platform_fit ["all"]
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

async function readSidecar(fullPath: string): Promise<Partial<ProjectAsset>> {
  try {
    const raw = await readFile(`${fullPath}.json`, "utf8");
    return normalizeSidecar(JSON.parse(raw));
  } catch {
    return {};
  }
}

// Scan `public/inspiration/<slug>/` and register any media files not already in the
// manifest (idempotent by path-derived id; operator edits persist). MUST run under the
// lock because it can write. Returns the manifest.
async function scanAndPersist(): Promise<Manifest> {
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
        brand_id: sidecar.brand_id ?? null,
        file_url: `/${relPath}`,
        asset_type: sidecar.asset_type ?? assetTypeFromExt(ext),
        title: sidecar.title ?? title,
        description: sidecar.description ?? null,
        tags: sidecar.tags ?? [],
        platform_fit: sidecar.platform_fit?.length ? sidecar.platform_fit : platform_fit,
        content_theme: sidecar.content_theme ?? null,
        visual_style: sidecar.visual_style ?? null,
        quality_score: sidecar.quality_score ?? 0,
        // The operator's own uploads are inspiration they chose — usable by default.
        reuse_allowed: sidecar.reuse_allowed ?? true,
        mandatory: sidecar.mandatory ?? false,
        approved: sidecar.approved ?? true,
        source_tool: "manual_upload",
        rights_status: sidecar.rights_status ?? "owned",
        transcript: sidecar.transcript ?? null,
        extracted_text: sidecar.extracted_text ?? null,
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

/** Public, lock-guarded scan (drop a file, then this registers it). */
export function scanInspirationFolder(): Promise<Manifest> {
  return withLock(scanAndPersist);
}

function fitsPlatform(asset: ProjectAsset, platform: string): boolean {
  const p = platform.toLowerCase();
  const fit = Array.isArray(asset.platform_fit) ? asset.platform_fit : ["all"];
  return fit.some((x) => x === p || x === "all");
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
  // Cap the ranked pool to the same size the Supabase query fetches (24) BEFORE filtering,
  // so local and cloud return identical picks even past 24 eligible assets.
  return selectAssetCandidates(eligible, manifest.usages, args.platform, args.limit ?? 6, CLOUD_POOL_CAP);
}

export async function createLocalAsset(input: Partial<ProjectAsset> & { project_slug: ProjectSlug }): Promise<ProjectAsset | null> {
  return withLock(async () => {
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
  });
}

// Register a file the upload route just wrote under public/inspiration/<slug>/.
// Writes the operator metadata as a sidecar and scans, so the asset gets its ONE
// canonical path-derived id (no duplicate auto-approved record on the next scan — C2).
export async function registerLocalUpload(args: { slug: ProjectSlug; fileName: string; metadata?: Partial<ProjectAsset> }): Promise<ProjectAsset | null> {
  const relPath = path.posix.join("inspiration", args.slug, args.fileName);
  const id = idForPath(relPath);
  if (args.metadata && Object.keys(args.metadata).length) {
    const dir = path.join(mediaRoot, args.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${args.fileName}.json`), JSON.stringify(args.metadata, null, 2));
  }
  const manifest = await scanInspirationFolder();
  return manifest.assets.find((a) => a.id === id) ?? null;
}

export async function recordLocalAssetUsage(args: { assetId: string; contentItemId?: string | null; campaignId?: string | null; platform?: string | null; reused?: boolean }): Promise<void> {
  await withLock(async () => {
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
  });
}
