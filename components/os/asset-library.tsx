"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Star, Trash2, Upload } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";
import type { Brand, ProjectAsset } from "@/lib/types";

const PROJECTS: { slug: string; label: string }[] = [
  { slug: "gridfactory", label: "GridFactory" },
  { slug: "gulf_el_nexride", label: "Gulf-EL / NexRide" }
];
const TYPES = ["image", "video", "carousel", "deck", "pdf", "script", "note", "logo", "reference", "other"];
const PLATFORMS = ["all", "linkedin", "x", "instagram", "facebook", "tiktok", "youtube", "website"];
const TOOLS = ["manual_upload", "google_flow", "veo", "higgsfield", "sora", "runway", "canva", "other"];

function projectLabel(slug: string) {
  return PROJECTS.find((p) => p.slug === slug)?.label ?? slug;
}

export function AssetLibrary({ brands, initialAssets }: { brands: Brand[]; initialAssets: ProjectAsset[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fProject, setFProject] = useState("");
  const [fPlatform, setFPlatform] = useState("");
  const [fType, setFType] = useState("");
  const [fApproved, setFApproved] = useState(false);

  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        if (fProject && a.project_slug !== fProject) return false;
        if (fType && a.asset_type !== fType) return false;
        if (fApproved && !a.approved) return false;
        if (fPlatform && !a.platform_fit.includes(fPlatform) && !a.platform_fit.includes("all")) return false;
        return true;
      }),
    [assets, fProject, fPlatform, fType, fApproved]
  );

  async function upload(form: HTMLFormElement) {
    setUploading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/marketing/assets", { method: "POST", body: new FormData(form) });
      const payload = (await res.json()) as { asset?: ProjectAsset; error?: string };
      if (!res.ok || !payload.asset) throw new Error(payload.error ?? "Upload failed.");
      setAssets((cur) => [payload.asset!, ...cur]);
      form.reset();
      setShowUpload(false);
      setMessage(`Added "${payload.asset.title}".`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function toggle(asset: ProjectAsset, patch: Partial<ProjectAsset>) {
    setBusyId(asset.id);
    try {
      const res = await fetch(`/api/marketing/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = (await res.json()) as { asset?: ProjectAsset; error?: string };
      if (!res.ok || !payload.asset) throw new Error(payload.error ?? "Update failed.");
      setAssets((cur) => cur.map((a) => (a.id === asset.id ? payload.asset! : a)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(asset: ProjectAsset) {
    setBusyId(asset.id);
    try {
      const res = await fetch(`/api/marketing/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed.");
      setAssets((cur) => cur.filter((a) => a.id !== asset.id));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <OSSelect value={fProject} onChange={(e) => setFProject(e.target.value)}>
          <option value="">All projects</option>
          {PROJECTS.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}
        </OSSelect>
        <OSSelect value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}>
          <option value="">Any platform</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </OSSelect>
        <OSSelect value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">Any type</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </OSSelect>
        <label className="flex items-center gap-1.5 text-sm text-neutral-300">
          <input type="checkbox" checked={fApproved} onChange={(e) => setFApproved(e.target.checked)} /> Approved only
        </label>
        <div className="ml-auto">
          <OSButton onClick={() => setShowUpload((s) => !s)}><Upload className="h-4 w-4" /> {showUpload ? "Close" : "Upload asset"}</OSButton>
        </div>
      </div>

      {showUpload ? (
        <OSPanel>
          <form
            onSubmit={(e) => { e.preventDefault(); void upload(e.currentTarget); }}
            className="grid gap-3 md:grid-cols-2"
          >
            <OSField label="Project"><OSSelect name="project_slug" required defaultValue="gridfactory">{PROJECTS.map((p) => <option key={p.slug} value={p.slug}>{p.label}</option>)}</OSSelect></OSField>
            <OSField label="Brand (optional)"><OSSelect name="brand_id" defaultValue=""><option value="">— none —</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</OSSelect></OSField>
            <OSField label="File (image / video / pdf / deck)"><OSInput type="file" name="file" accept="image/*,video/*,application/pdf,.pdf,.ppt,.pptx,.key" /></OSField>
            <OSField label="…or external URL (Veo / Sora / Higgsfield link)"><OSInput name="file_url" placeholder="https://…" /></OSField>
            <OSField label="Title"><OSInput name="title" required placeholder="e.g. Data-center container hero render" /></OSField>
            <OSField label="Asset type"><OSSelect name="asset_type" defaultValue="image">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</OSSelect></OSField>
            <OSField label="Platform fit (comma-separated)" hint="e.g. linkedin, x  — or 'all'"><OSInput name="platform_fit" placeholder="all" /></OSField>
            <OSField label="Source tool"><OSSelect name="source_tool" defaultValue="manual_upload">{TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}</OSSelect></OSField>
            <OSField label="Tags (comma-separated)"><OSInput name="tags" placeholder="hero, proof, gpu" /></OSField>
            <OSField label="Content theme"><OSInput name="content_theme" placeholder="e.g. compute-ready capacity" /></OSField>
            <OSField label="Visual style"><OSInput name="visual_style" placeholder="e.g. photoreal, cool palette" /></OSField>
            <OSField label="Quality score (0-100)"><OSInput name="quality_score" type="number" min={0} max={100} defaultValue={70} /></OSField>
            <OSField label="Rights status"><OSInput name="rights_status" placeholder="owned / licensed / TODO" /></OSField>
            <OSField label="Description"><OSTextarea name="description" placeholder="What this asset is and when to use it." /></OSField>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
              <label className="flex items-center gap-1.5 text-sm text-neutral-300"><input type="checkbox" name="approved" /> Approved</label>
              <label className="flex items-center gap-1.5 text-sm text-neutral-300"><input type="checkbox" name="mandatory" /> Mandatory</label>
              <label className="flex items-center gap-1.5 text-sm text-neutral-300"><input type="checkbox" name="reuse_allowed" defaultChecked /> Reusable across platforms</label>
              <div className="ml-auto">
                <OSButton type="submit" disabled={uploading}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Save asset</OSButton>
              </div>
            </div>
          </form>
        </OSPanel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <OSPanel key={a.id} className="flex flex-col">
            <AssetPreview asset={a} />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <OSBadge tone="info">{projectLabel(a.project_slug)}</OSBadge>
              <OSBadge tone="off">{a.asset_type}</OSBadge>
              {a.approved ? <OSBadge tone="ok">approved</OSBadge> : <OSBadge tone="warn">unapproved</OSBadge>}
              {a.mandatory ? <OSBadge tone="danger">mandatory</OSBadge> : null}
              <OSBadge tone={a.reuse_allowed ? "ok" : "off"}>{a.reuse_allowed ? "reusable" : "single-use"}</OSBadge>
            </div>
            <div className="mt-2 text-sm font-semibold text-neutral-50">{a.title}</div>
            <div className="mt-1 text-xs text-neutral-500">{a.platform_fit.join(" · ")} · used {a.used_count}×{a.content_theme ? ` · ${a.content_theme}` : ""}</div>
            {a.description ? <p className="mt-2 line-clamp-2 text-sm text-neutral-400">{a.description}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
              <button type="button" disabled={busyId === a.id} onClick={() => toggle(a, { approved: !a.approved })} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs hover:border-emerald-500 disabled:opacity-50"><Check className="h-3 w-3" /> {a.approved ? "Unapprove" : "Approve"}</button>
              <button type="button" disabled={busyId === a.id} onClick={() => toggle(a, { mandatory: !a.mandatory })} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs hover:border-amber-500 disabled:opacity-50"><Star className="h-3 w-3" /> {a.mandatory ? "Optional" : "Mandatory"}</button>
              <button type="button" disabled={busyId === a.id} onClick={() => toggle(a, { reuse_allowed: !a.reuse_allowed })} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs hover:border-cyan-500 disabled:opacity-50">{a.reuse_allowed ? "Lock to 1 platform" : "Allow reuse"}</button>
              <button type="button" disabled={busyId === a.id} onClick={() => remove(a)} className="ml-auto inline-flex items-center gap-1 rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-500 hover:border-rose-500 hover:text-rose-300 disabled:opacity-50"><Trash2 className="h-3 w-3" /></button>
            </div>
          </OSPanel>
        ))}
        {!filtered.length ? <OSPanel><p className="text-sm text-neutral-500">No assets yet. Upload your project’s real images, videos, carousels, and decks so Crina reuses them.</p></OSPanel> : null}
      </div>
    </div>
  );
}

function AssetPreview({ asset }: { asset: ProjectAsset }) {
  const url = asset.file_url ?? "";
  if (asset.asset_type === "video" && url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video src={url} controls className="aspect-video w-full rounded-md bg-black object-cover" />;
  }
  if ((asset.asset_type === "image" || asset.asset_type === "carousel" || asset.asset_type === "logo" || asset.asset_type === "reference") && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={asset.title} className="aspect-video w-full rounded-md object-cover" />;
  }
  return (
    <a href={url || "#"} target="_blank" rel="noreferrer" className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-neutral-950 text-xs uppercase tracking-wider text-neutral-500 hover:text-neutral-300">
      {asset.asset_type} {url ? "· open" : "· no file"}
    </a>
  );
}
