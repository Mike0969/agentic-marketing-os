"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { OSBadge } from "@/components/os/ui";
import type { ProjectAsset } from "@/lib/types";

const VIDEO_TYPES = new Set(["video"]);
const IMAGE_TYPES = new Set(["image", "carousel", "reference", "logo"]);

export function AssetAttachPicker({
  projectSlug,
  platform,
  preferVideo,
  onAttach,
  onClose
}: {
  projectSlug: string | null;
  platform: string;
  preferVideo: boolean;
  onAttach: (assetId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = projectSlug ? `?project_slug=${projectSlug}` : "";
    fetch(`/api/marketing/assets${qs}`)
      .then((r) => r.json())
      .then((payload: { assets?: ProjectAsset[] }) => {
        if (active) setAssets((payload.assets ?? []).filter((a) => a.file_url));
      })
      .catch(() => active && setError("Could not load assets."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [projectSlug]);

  // Order: the needed media type first, then approved, mandatory, quality.
  const ordered = useMemo(() => {
    const wanted = preferVideo ? VIDEO_TYPES : IMAGE_TYPES;
    return [...assets].sort((a, b) => {
      const at = wanted.has(a.asset_type) ? 0 : 1;
      const bt = wanted.has(b.asset_type) ? 0 : 1;
      if (at !== bt) return at - bt;
      if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
      if (a.approved !== b.approved) return a.approved ? -1 : 1;
      return (b.quality_score ?? 0) - (a.quality_score ?? 0);
    });
  }, [assets, preferVideo]);

  async function attach(assetId: string) {
    setAttaching(assetId);
    setError(null);
    try {
      await onAttach(assetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attach failed.");
    } finally {
      setAttaching(null);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-cyan-500/30 bg-neutral-950/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
          Attach from library {preferVideo ? "· video first" : ""}
        </span>
        <button type="button" onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-300">Close</button>
      </div>
      {error ? <div className="mb-2 text-xs text-rose-300">{error}</div> : null}
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading assets…</div>
      ) : !ordered.length ? (
        <p className="py-2 text-sm text-neutral-500">
          No {projectSlug ? "project" : ""} assets uploaded yet. Add them in <span className="text-neutral-300">Marketing → Assets</span>.
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {ordered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900/60 p-2">
              <Thumb asset={a} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-100">{a.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <OSBadge tone="off">{a.asset_type}</OSBadge>
                  {a.approved ? <OSBadge tone="ok">approved</OSBadge> : <OSBadge tone="warn">unapproved</OSBadge>}
                  {a.mandatory ? <OSBadge tone="danger">mandatory</OSBadge> : null}
                  <OSBadge tone={a.reuse_allowed ? "ok" : "off"}>{a.reuse_allowed ? "reusable" : "single-use"}</OSBadge>
                  {a.quality_score ? <OSBadge tone="info">Q{a.quality_score}</OSBadge> : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-600">{a.platform_fit.join(" · ")}{a.tags.length ? ` · ${a.tags.join(", ")}` : ""}</div>
              </div>
              <button
                type="button"
                disabled={attaching === a.id}
                onClick={() => attach(a.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-100 transition hover:border-cyan-500 hover:text-cyan-200 disabled:opacity-50"
              >
                {attaching === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} Attach
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Thumb({ asset }: { asset: ProjectAsset }) {
  const url = asset.file_url ?? "";
  if (asset.asset_type === "video") {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video src={url} muted className="h-14 w-20 shrink-0 rounded bg-black object-cover" />;
  }
  if (IMAGE_TYPES.has(asset.asset_type) && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={asset.title} className="h-14 w-20 shrink-0 rounded object-cover" />;
  }
  return <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-[10px] uppercase text-neutral-500">{asset.asset_type}</div>;
}
