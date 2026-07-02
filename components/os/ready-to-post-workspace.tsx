"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, Loader2, Paperclip, Plus, XCircle } from "lucide-react";
import { OSBadge, OSButton, OSPanel, OSTextarea } from "@/components/os/ui";
import { REJECT_REASONS } from "@/lib/marketing/reject-reasons";
import { AssetAttachPicker } from "@/components/os/asset-attach-picker";
import { validatePackage } from "@/lib/marketing/package-validator";
import { resolvePlatform } from "@/lib/marketing/platform-specs";
import type { Brand, Campaign, ContentAsset, ContentItem, ReadyPackage } from "@/lib/types";

type Props = {
  brands: Brand[];
  campaigns: Campaign[];
  contentItems: ContentItem[];
  assets: ContentAsset[];
  connectedByBrand: Record<string, string[]>;
};

// Platforms an operator can add as a native variant (one campaign idea -> one native package each).
const ADDABLE_PLATFORMS: { key: string; label: string; platform: string }[] = [
  { key: "linkedin", label: "LinkedIn", platform: "LinkedIn" },
  { key: "x", label: "X", platform: "X" },
  { key: "instagram", label: "Instagram carousel", platform: "Instagram" },
  { key: "instagram_image", label: "IG image test", platform: "Instagram image test" },
  { key: "tiktok", label: "TikTok", platform: "TikTok" },
  { key: "facebook", label: "Facebook", platform: "Facebook" },
  { key: "blog", label: "Blog", platform: "Blog" }
];
type PlatformOption = (typeof ADDABLE_PLATFORMS)[number];

const VIDEO_URL_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;
function isVideoUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && VIDEO_URL_RE.test(url);
}

// Client-side project slug from brand name (mirrors resolveProjectSlug on the server).
function slugForBrandName(name: string | null | undefined): string | null {
  const n = (name ?? "").toLowerCase();
  if (n.includes("gridfactory")) return "gridfactory";
  if (n.includes("gulf") || n.includes("nexride")) return "gulf_el_nexride";
  return null;
}

function fallbackMarked(item: ContentItem) {
  return item.performance_summary?.toUpperCase().includes("FALLBACK") || item.ready_package?.fallback_used;
}

function packageFor(item: ContentItem): ReadyPackage {
  return (
    item.ready_package ?? {
      platform: item.platform,
      content_type: item.content_type,
      text: item.body || item.hook || item.title,
      title: item.title,
      caption: item.body,
      alt_text: `Visual for ${item.title}`,
      hashtags: [],
      asset_checklist: ["Verify claims", "Confirm CTA", "Check image crop"],
      fallback_used: true
    }
  );
}

function platformTone(platform: string): "info" | "demo" | "off" {
  const normalized = platform.toLowerCase();
  if (normalized.includes("instagram")) return "demo";
  if (normalized.includes("linkedin") || normalized === "x") return "info";
  return "off";
}

function desiredAssetCount(item: ContentItem) {
  const raw = `${item.platform} ${item.content_type}`.toLowerCase();
  if (raw.includes("carousel")) return 5;
  return 1;
}

function formatPackageText(pkg: ReadyPackage) {
  const parts = [pkg.title, pkg.text || pkg.caption];
  if (pkg.slides?.length) {
    parts.push(
      pkg.slides
        .map((slide, index) => [`Slide ${index + 1}`, slide.headline, slide.text].filter(Boolean).join("\n"))
        .join("\n\n")
    );
  }
  parts.push(pkg.body, pkg.hashtags?.join(" "));
  return parts.filter(Boolean).join("\n\n");
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function defaultDateTimeLocal(index: number) {
  const date = new Date();
  date.setDate(date.getDate() + 1 + Math.floor(index / 3));
  const slot = index % 3;
  date.setHours(slot === 0 ? 9 : slot === 1 ? 14 : 19, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
}

function formatSchedule(value: string | null | undefined) {
  if (!value) return "No time set yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid time";
  return date.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function platformOptionMatches(item: ContentItem, option: PlatformOption) {
  const raw = `${item.platform} ${item.content_type}`.toLowerCase();
  if (option.key === "instagram_image") return raw.includes("instagram") && raw.includes("image");
  if (option.key === "instagram") return resolvePlatform(item.platform) === "instagram" && !raw.includes("image");
  return resolvePlatform(item.platform) === option.key;
}

export function ReadyToPostWorkspace({ brands, campaigns, contentItems, assets, connectedByBrand }: Props) {
  const [items, setItems] = useState(contentItems);
  const [assetItems, setAssetItems] = useState(assets);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reworkingIds, setReworkingIds] = useState<Record<string, boolean>>({});
  const [reworkedIds, setReworkedIds] = useState<Record<string, boolean>>({});
  const [generatingAssetIds, setGeneratingAssetIds] = useState<Record<string, boolean>>({});
  const [attemptedAssetIds, setAttemptedAssetIds] = useState<Record<string, boolean>>({});
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState(() => contentItems[0]?.brand_id ?? brands[0]?.id ?? "all");
  const [scheduleTimes, setScheduleTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(contentItems.map((item, index) => [item.id, toDateTimeLocal(item.scheduled_at) || defaultDateTimeLocal(index)]))
  );
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const campaignMap = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);
  const assetsByItem = useMemo(() => {
    const grouped = new Map<string, ContentAsset[]>();
    for (const asset of assetItems) {
      grouped.set(asset.content_item_id, [...(grouped.get(asset.content_item_id) ?? []), asset]);
    }
    return grouped;
  }, [assetItems]);

  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.brand_id, (counts.get(item.brand_id) ?? 0) + 1);
    return counts;
  }, [items]);

  const visibleItems = useMemo(
    () => (selectedBrandId === "all" ? items : items.filter((item) => item.brand_id === selectedBrandId)),
    [items, selectedBrandId]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of visibleItems) {
      map.set(item.campaign_id, [...(map.get(item.campaign_id) ?? []), item]);
    }
    return [...map.entries()];
  }, [visibleItems]);

  useEffect(() => {
    setScheduleTimes((current) => {
      let changed = false;
      const next = { ...current };
      items.forEach((item, index) => {
        if (!next[item.id]) {
          next[item.id] = toDateTimeLocal(item.scheduled_at) || defaultDateTimeLocal(index);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [items]);

  async function decide(item: ContentItem, decision: "approved" | "rejected" | "changes_requested") {
    const text = reasons[item.id]?.trim() ?? "";
    const selectedTags = tags[item.id] ?? [];
    const feedback = [selectedTags.join("; "), text].filter(Boolean).join(" · ");
    if (decision !== "approved" && !feedback) {
      setRejectId(item.id);
      setMessage("Pick a reason chip (or add a note) so Crina can learn and rework the package.");
      return;
    }

    setBusyId(item.id);
    setMessage(null);
    try {
      if (decision === "approved") {
        const response = await fetch(`/api/marketing/approvals/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, feedback, gate: "gate_2", requested_by_agent: "Crina", scheduled_at: scheduleTimes[item.id] || null })
        });
        const payload = (await response.json()) as { contentItem?: ContentItem; error?: string };
        if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Decision failed.");
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? payload.contentItem! : candidate)));
        setScheduleTimes((current) => ({ ...current, [item.id]: toDateTimeLocal(payload.contentItem!.scheduled_at) || current[item.id] || "" }));
        setRejectId(null);
        const when = payload.contentItem.scheduled_at ? new Date(payload.contentItem.scheduled_at).toLocaleString() : null;
        setMessage(when ? `Approved — Crina scheduled it for ${when}.` : "Approved — added to the schedule.");
      } else if (decision === "changes_requested") {
        // Request changes → Crina reroutes to Visual or Content and regenerates a better version.
        setReworkingIds((current) => ({ ...current, [item.id]: true }));
        setRejectId(null);
        setMessage(`Crina is reworking "${item.title}" based on your remark — regenerating (~20-40s)...`);
        try {
          const response = await fetch(`/api/marketing/content-items/${item.id}/rework`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ remark: feedback, tags: selectedTags })
          });
          const payload = (await response.json()) as { contentItem?: ContentItem; routedTo?: string[]; error?: string };
          if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Rework failed.");
          setItems((current) => current.map((candidate) => (candidate.id === item.id ? payload.contentItem! : candidate)));
          setScheduleTimes((current) => ({ ...current, [item.id]: toDateTimeLocal(payload.contentItem!.scheduled_at) || current[item.id] || "" }));
          setReworkedIds((current) => ({ ...current, [item.id]: true }));
          setReasons((current) => ({ ...current, [item.id]: "" }));
          setTags((current) => ({ ...current, [item.id]: [] }));
          setMessage(`Crina reworked it (routed to ${(payload.routedTo ?? ["Content"]).join(" + ")}). The new version is ready — review it again.`);
        } finally {
          setReworkingIds((current) => ({ ...current, [item.id]: false }));
        }
      } else {
        // Reject completely → this is not the right idea/target/platform variant, so archive it.
        const response = await fetch(`/api/marketing/approvals/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, feedback, gate: "gate_2", requested_by_agent: "Crina", archive: true })
        });
        const payload = (await response.json()) as { contentItem?: ContentItem; error?: string };
        if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Reject failed.");
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
        setRejectId(null);
        setMessage(`Rejected and removed "${item.title}" from Ready to Post.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision failed.");
    } finally {
      setBusyId(null);
    }
  }

  // Add a native variant for one more platform (generates the platform-native package, not a cross-post).
  async function addPlatform(campaignId: string, option: PlatformOption) {
    setAddingFor(`${campaignId}:${option.key}`);
    setMessage(`Generating a native ${option.label} package (~20-40s)…`);
    try {
      const response = await fetch(`/api/marketing/campaigns/${campaignId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: option.platform })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not add platform.");
      setMessage(`${option.label} package created — refreshing…`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add platform.");
      setAddingFor(null);
    }
  }

  // Remove a platform variant = archive it (recoverable), so this campaign no longer targets it.
  async function removePlatform(item: ContentItem) {
    setBusyId(item.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/marketing/content-items/${item.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove" })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove.");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage(`${item.platform} variant archived (recoverable).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove.");
    } finally {
      setBusyId(null);
    }
  }

  // Attach a Project Asset Library item to this post's ready package (video-aware; unblocks TikTok/FB).
  async function attachAsset(item: ContentItem, assetId: string) {
    setMessage(`Attaching media to ${item.platform}…`);
    const res = await fetch(`/api/marketing/content-items/${item.id}/attach-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId })
    });
    const payload = (await res.json().catch(() => ({}))) as { contentItem?: ContentItem; error?: string };
    if (!res.ok || !payload.contentItem) {
      setMessage(payload.error ?? "Attach failed.");
      throw new Error(payload.error ?? "Attach failed.");
    }
    setItems((current) => current.map((c) => (c.id === item.id ? payload.contentItem! : c)));
    const refreshed = (payload.contentItem.ready_package?.assets ?? []).map((asset, index) => ({
      id: `${item.id}:attached:${asset.position ?? index + 1}`,
      content_item_id: item.id,
      kind: asset.kind,
      url: asset.url ?? null,
      prompt: asset.prompt ?? null,
      position: asset.position ?? index + 1,
      model: asset.model ?? null,
      provider: asset.provider ?? null,
      status: asset.status ?? "generated",
      error: asset.error ?? null
    })) as ContentAsset[];
    setAssetItems((current) => [...current.filter((a) => a.content_item_id !== item.id), ...refreshed]);
    setMessage("Media attached — package updated.");
  }

  async function copyPackage(item: ContentItem) {
    const pkg = packageFor(item);
    await navigator.clipboard.writeText(formatPackageText(pkg));
    setMessage("Package text copied.");
  }

  function downloadPackage(item: ContentItem) {
    const pkg = packageFor(item);
    const blob = new Blob([JSON.stringify({ item, ready_package: pkg, assets: assetsByItem.get(item.id) ?? [] }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ready-package.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    for (const item of items) {
      const desired = desiredAssetCount(item);
      if (desired <= 1) continue;
      const existing = assetsByItem.get(item.id) ?? [];
      if (existing.length >= desired || generatingAssetIds[item.id] || attemptedAssetIds[item.id]) continue;

      setGeneratingAssetIds((current) => ({ ...current, [item.id]: true }));
      setAttemptedAssetIds((current) => ({ ...current, [item.id]: true }));
      void fetch(`/api/marketing/content-items/${item.id}/assets/generate`, { method: "POST" })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as { assets?: ContentAsset[]; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Deferred asset generation failed.");
          if (payload.assets?.length) {
            setAssetItems((current) => {
              const incoming = new Map(payload.assets!.map((asset) => [`${asset.content_item_id}:${asset.position}`, asset]));
              const existingAssets = current.filter((asset) => !incoming.has(`${asset.content_item_id}:${asset.position}`));
              return [...existingAssets, ...payload.assets!].sort((a, b) => a.position - b.position);
            });
          }
        })
        .catch((error) => setMessage(error instanceof Error ? error.message : "Deferred asset generation failed."))
        .finally(() => setGeneratingAssetIds((current) => ({ ...current, [item.id]: false })));
    }
  }, [assetsByItem, attemptedAssetIds, generatingAssetIds, items]);

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}
      <OSPanel className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Project folder</span>
          {brands.map((brand) => {
            const active = selectedBrandId === brand.id;
            const count = brandCounts.get(brand.id) ?? 0;
            return (
              <button
                key={brand.id}
                type="button"
                onClick={() => setSelectedBrandId(brand.id)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  active ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                }`}
              >
                {brand.name} <span className="ml-1 text-xs text-neutral-500">{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelectedBrandId("all")}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              selectedBrandId === "all" ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
            }`}
          >
            All <span className="ml-1 text-xs text-neutral-500">{items.length}</span>
          </button>
        </div>
      </OSPanel>
      {grouped.map(([campaignId, campaignItems]) => {
        const campaign = campaignMap.get(campaignId);
        const brand = campaign ? brandMap.get(campaign.brand_id) : null;
        return (
          <OSPanel key={campaignId}>
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500">{brand?.name ?? "Unknown brand"}</div>
                <h2 className="mt-1 text-lg font-semibold text-neutral-50">{campaign?.title ?? "Campaign package"}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-400">Review native platform packages, edit the scheduled time, approve only the platforms you want, request changes, or reject completely.</p>
              </div>
              <OSBadge tone="warn">{campaignItems.filter((item) => item.approval_status === "pending").length} need decision</OSBadge>
            </div>
            <PlatformSelector campaignId={campaignId} campaignItems={campaignItems} addingFor={addingFor} busyId={busyId} onAdd={addPlatform} onRemove={removePlatform} />
            <div className="grid gap-4 xl:grid-cols-2">
              {campaignItems.map((item) => (
                <ReadyCard
                  key={item.id}
                  item={item}
                  connected={(connectedByBrand[item.brand_id] ?? []).includes(resolvePlatform(item.platform) ?? "__none__")}
                  assets={assetsByItem.get(item.id) ?? []}
                  generatingAssets={generatingAssetIds[item.id] ?? false}
                  scheduleValue={scheduleTimes[item.id] ?? ""}
                  onScheduleChange={(value) => setScheduleTimes((current) => ({ ...current, [item.id]: value }))}
                  busy={busyId === item.id}
                  reworking={reworkingIds[item.id] ?? false}
                  reworked={reworkedIds[item.id] ?? false}
                  rejecting={rejectId === item.id}
                  reason={reasons[item.id] ?? ""}
                  onReason={(reason) => setReasons((current) => ({ ...current, [item.id]: reason }))}
                  selectedTags={tags[item.id] ?? []}
                  onToggleTag={(label) =>
                    setTags((current) => {
                      const set = new Set(current[item.id] ?? []);
                      if (set.has(label)) set.delete(label);
                      else set.add(label);
                      return { ...current, [item.id]: [...set] };
                    })
                  }
                  onApprove={() => decide(item, "approved")}
                  onReject={() => decide(item, "rejected")}
                  onRequestChanges={() => decide(item, "changes_requested")}
                  onOpenReject={() => setRejectId(item.id)}
                  onCopy={() => copyPackage(item)}
                  onDownload={() => downloadPackage(item)}
                  onRemove={() => removePlatform(item)}
                  projectSlug={item.ready_package?.project_slug ?? slugForBrandName(brandMap.get(item.brand_id)?.name)}
                  onAttach={(assetId) => attachAsset(item, assetId)}
                  platformControls={
                    <PlatformSelector
                      campaignId={campaignId}
                      campaignItems={campaignItems}
                      addingFor={addingFor}
                      busyId={busyId}
                      onAdd={addPlatform}
                      onRemove={removePlatform}
                      compact
                    />
                  }
                />
              ))}
            </div>
          </OSPanel>
        );
      })}
      {!grouped.length ? (
        <OSPanel>
          <p className="text-sm text-neutral-500">No ready-to-post packages in this project folder. Choose another project or approve a campaign objective so Crina can create packages.</p>
        </OSPanel>
      ) : null}
    </div>
  );
}

function PlatformSelector({
  campaignId,
  campaignItems,
  addingFor,
  busyId,
  onAdd,
  onRemove,
  compact = false
}: {
  campaignId: string;
  campaignItems: ContentItem[];
  addingFor: string | null;
  busyId: string | null;
  onAdd: (campaignId: string, option: PlatformOption) => void;
  onRemove: (item: ContentItem) => void;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "mb-3" : "mb-4"} rounded-md border border-neutral-800 bg-neutral-900/40 p-2`}>
      <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">{compact ? "Make this idea for more platforms" : "Select platforms for this idea"}</div>
      <div className="flex flex-wrap items-center gap-2">
        {ADDABLE_PLATFORMS.map((p) => {
          const existing = campaignItems.find((item) => platformOptionMatches(item, p));
          const generating = addingFor === `${campaignId}:${p.key}`;
          return existing ? (
            <button
              key={p.key}
              type="button"
              disabled={busyId === existing.id}
              onClick={() => onRemove(existing)}
              title={`Deselect ${p.label}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
            >
              {busyId === existing.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} {p.label}
              <XCircle className="h-3 w-3 opacity-70" />
            </button>
          ) : (
            <button
              key={p.key}
              type="button"
              disabled={Boolean(addingFor)}
              onClick={() => onAdd(campaignId, p)}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 transition hover:border-cyan-500 hover:text-cyan-200 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} {p.label}
            </button>
          );
        })}
      </div>
      {addingFor?.startsWith(`${campaignId}:`) ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-cyan-300">
          <Loader2 className="h-3 w-3 animate-spin" /> Crina is writing the {ADDABLE_PLATFORMS.find((p) => p.key === addingFor.split(":")[1])?.label ?? "platform"} package — this can take ~1–2 min on the local model. The page refreshes automatically when it&apos;s ready.
        </div>
      ) : !compact ? (
        <p className="mt-2 text-xs text-neutral-500">Generate every platform you want, then approve only those cards. Reject or remove variants that are wrong for the idea.</p>
      ) : null}
    </div>
  );
}

function ReadyCard({
  item,
  connected,
  assets,
  generatingAssets,
  scheduleValue,
  onScheduleChange,
  busy,
  reworking,
  reworked,
  rejecting,
  reason,
  onReason,
  selectedTags,
  onToggleTag,
  onApprove,
  onReject,
  onRequestChanges,
  onOpenReject,
  onCopy,
  onDownload,
  onRemove,
  projectSlug,
  onAttach,
  platformControls
}: {
  item: ContentItem;
  connected: boolean;
  projectSlug: string | null;
  onAttach: (assetId: string) => Promise<void>;
  assets: ContentAsset[];
  generatingAssets: boolean;
  scheduleValue: string;
  onScheduleChange: (value: string) => void;
  busy: boolean;
  reworking: boolean;
  reworked: boolean;
  rejecting: boolean;
  reason: string;
  onReason: (reason: string) => void;
  selectedTags: string[];
  onToggleTag: (label: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  onOpenReject: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onRemove: () => void;
  platformControls: ReactNode;
}) {
  const pkg = packageFor(item);
  const pending = item.approval_status === "pending" || item.workflow_stage === "human_final_approval" || item.status === "approval";
  const approvedOrScheduled =
    item.approval_status === "approved" ||
    item.status === "scheduled" ||
    item.workflow_stage === "publishing_prep" ||
    item.workflow_stage === "scheduled";
  const actionable = pending || approvedOrScheduled;
  const isVideo = `${item.platform} ${item.content_type}`.toLowerCase().includes("video");
  const packageAssets = (pkg.assets ?? []).map((asset, index) => ({
    id: `${item.id}:package:${asset.position ?? index + 1}`,
    content_item_id: item.id,
    kind: asset.kind,
    url: asset.url ?? null,
    prompt: asset.prompt ?? null,
    position: asset.position ?? index + 1,
    model: asset.model ?? null,
    provider: asset.provider ?? null,
    status: asset.status ?? "placeholder",
    error: asset.error ?? null
  })) satisfies ContentAsset[];
  const mediaAssets = (assets.length ? assets : packageAssets).filter((asset) => asset.url);
  const videoAsset = mediaAssets.find((asset) => asset.kind === "video_placeholder" || isVideoUrl(asset.url));
  const videoUrl = videoAsset?.url ?? (isVideoUrl(item.visual_asset_url) || pkg.video_status === "draft_asset" ? item.visual_asset_url : null);
  const hasVideo = Boolean(videoUrl);
  const imageAssets = mediaAssets.filter((asset) => asset.kind !== "video_placeholder" && !isVideoUrl(asset.url));
  const primaryImage = imageAssets[0]?.url ?? (hasVideo ? null : item.visual_asset_url);
  const validation = validatePackage(item);
  const blockers = validation.issues.filter((i) => i.severity === "blocker");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const needsVideo = isVideo && !hasVideo;
  const [slide, setSlide] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const isCarousel = imageAssets.length > 1 || Boolean(pkg.slides?.length);
  const activeSlide = isCarousel ? Math.min(slide, imageAssets.length - 1) : 0;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <OSBadge tone={platformTone(item.platform)}>{item.platform}</OSBadge>
        {reworking ? (
          <OSBadge tone="info">⟳ Reworking…</OSBadge>
        ) : reworked ? (
          <OSBadge tone="info">Reworked · review again</OSBadge>
        ) : pending ? (
          <OSBadge tone="warn">Ready to review</OSBadge>
        ) : approvedOrScheduled ? (
          <OSBadge tone="ok">Selected for schedule</OSBadge>
        ) : (
          <OSBadge tone={item.approval_status === "approved" ? "ok" : "off"}>{item.approval_status}</OSBadge>
        )}
        {fallbackMarked(item) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
        {item.crina_review_notes ? <OSBadge tone={item.crina_review_notes.includes("pass") ? "ok" : "off"}>Crina {item.crina_review_notes}</OSBadge> : null}
        {hasVideo ? <OSBadge tone="ok">Video attached</OSBadge> : primaryImage ? <OSBadge tone="ok">Image ready</OSBadge> : <OSBadge tone="demo">DRAFT ASSET</OSBadge>}
        {generatingAssets ? <OSBadge tone="info">Generating slides</OSBadge> : null}
        {needsVideo ? <OSBadge tone="danger">Needs video</OSBadge> : null}
        <OSBadge tone={validation.ok ? "ok" : "danger"}>{validation.ok ? "Platform-ready" : "Not platform-ready"}</OSBadge>
        {connected ? <OSBadge tone="ok">Connected</OSBadge> : <OSBadge tone="warn">{item.platform} not connected — connect in Settings to post</OSBadge>}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          title="Archive this platform variant (recoverable)"
          className="ml-auto inline-flex items-center gap-1 rounded border border-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500 transition hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-50"
        >
          <XCircle className="h-3 w-3" /> Remove
        </button>
      </div>

      {blockers.length || warnings.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {blockers.map((issue, idx) => <OSBadge key={`b${idx}`} tone="danger">{issue.message}</OSBadge>)}
          {warnings.map((issue, idx) => <OSBadge key={`w${idx}`} tone="warn">{issue.message}</OSBadge>)}
        </div>
      ) : null}

      {platformControls}

      <div className="mb-3 rounded-md border border-neutral-800 bg-neutral-900/60 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500">Scheduled for</div>
            <div className="mt-1 text-sm font-medium text-neutral-100">{scheduleValue ? formatSchedule(scheduleValue) : formatSchedule(item.scheduled_at)}</div>
          </div>
          <label className="text-xs text-neutral-500">
            Change day/time
            <input
              type="datetime-local"
              value={scheduleValue}
              onChange={(event) => onScheduleChange(event.target.value)}
              disabled={busy}
              className="mt-1 block rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none transition focus:border-cyan-400 disabled:opacity-60"
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        {hasVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={videoUrl ?? ""} controls playsInline className="aspect-video w-full bg-black" />
        ) : primaryImage ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageAssets[activeSlide]?.url ?? primaryImage ?? ""} alt={pkg.alt_text ?? item.title} className={`w-full object-cover ${isCarousel ? "aspect-square" : "aspect-video"}`} />
            {isCarousel ? (
              <>
                <button type="button" aria-label="Previous slide" onClick={() => setSlide((s) => (Math.min(s, imageAssets.length - 1) - 1 + imageAssets.length) % imageAssets.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next slide" onClick={() => setSlide((s) => (Math.min(s, imageAssets.length - 1) + 1) % imageAssets.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70"><ChevronRight className="h-4 w-4" /></button>
                <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">{activeSlide + 1} / {imageAssets.length}</div>
                <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                  {imageAssets.map((a, i) => <span key={a.id} className={`h-1.5 rounded-full transition-all ${i === activeSlide ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />)}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center bg-neutral-950 text-sm text-neutral-600">Draft asset placeholder</div>
        )}
        {isCarousel ? (
          <div className="flex gap-2 overflow-x-auto border-t border-neutral-800 p-2">
            {imageAssets.map((asset, i) => (
              <button key={asset.id} type="button" onClick={() => setSlide(i)} className={`shrink-0 overflow-hidden rounded border-2 transition ${i === activeSlide ? "border-cyan-400" : "border-transparent opacity-70 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url!} alt={`Slide ${i + 1}`} className="h-16 w-16 object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowPicker((s) => !s)} className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 transition hover:border-cyan-500 hover:text-cyan-200">
          <Paperclip className="h-3 w-3" /> {hasVideo || primaryImage ? "Replace media from library" : "Attach media from library"}
        </button>
        {needsVideo ? <span className="text-xs text-rose-300">Needs a video — attach one from the library to unblock.</span> : null}
      </div>
      {showPicker ? (
        <AssetAttachPicker
          projectSlug={projectSlug}
          platform={item.platform}
          preferVideo={isVideo}
          onAttach={async (assetId) => { await onAttach(assetId); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      ) : null}

      {pkg.asset_source ? (
        <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <OSBadge tone={pkg.asset_source === "library" ? "ok" : "info"}>
              {pkg.asset_source === "library" ? "♻ From library" : "✦ Newly generated"}
            </OSBadge>
            {pkg.selected_asset_title ? <OSBadge tone="off">{pkg.selected_asset_title}</OSBadge> : null}
            {pkg.project_slug ? <OSBadge tone="off">{pkg.project_slug === "gulf_el_nexride" ? "Gulf-EL / NexRide" : "GridFactory"}</OSBadge> : null}
            {pkg.asset_source === "library" ? <OSBadge tone={pkg.reuse_allowed ? "ok" : "warn"}>{pkg.reuse_allowed ? "reuse allowed" : "single-use"}</OSBadge> : null}
          </div>
          {pkg.crina_route_notes ? <p className="mt-1.5 text-xs leading-5 text-neutral-500">Crina: {pkg.crina_route_notes}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900/70 p-3">
        <div className="text-sm font-semibold text-neutral-50">{pkg.title ?? item.title}</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{pkg.text || pkg.caption}</p>
        {pkg.slides?.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {pkg.slides.map((slideItem, index) => (
              <div key={`${index}:${slideItem.headline}`} className="rounded-md border border-neutral-800 bg-neutral-950/70 p-2">
                <div className="text-xs uppercase tracking-wider text-neutral-500">Slide {index + 1}</div>
                {slideItem.headline ? <div className="mt-1 text-sm font-semibold text-neutral-100">{slideItem.headline}</div> : null}
                {slideItem.text ? <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-neutral-400">{slideItem.text}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        {pkg.body ? <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-neutral-400">{pkg.body}</p> : null}
        {pkg.hashtags?.length ? <div className="mt-3 text-sm text-cyan-300">{pkg.hashtags.join(" ")}</div> : null}
        {isVideo ? (
          <div className="mt-3 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-violet-300">Manual video package</div>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{pkg.script ?? item.body}</p>
            {pkg.storyboard?.length ? (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-400">
                {pkg.storyboard.map((beat) => <li key={beat}>{beat}</li>)}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>

      {rejecting ? (
        <div className="mt-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Tell Crina what is wrong. Request changes keeps this variant and regenerates it; reject completely removes it from this campaign.</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => {
              const active = selectedTags.includes(r.label);
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => onToggleTag(r.label)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-rose-500/60 bg-rose-500/15 text-rose-200"
                      : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <OSTextarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Optional note: anything the chips don't cover..." />
          <div className="mt-2 flex flex-wrap gap-2">
            <OSButton variant="secondary" onClick={onRequestChanges} disabled={busy || (!reason.trim() && selectedTags.length === 0)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Request changes
            </OSButton>
            <OSButton variant="danger" onClick={onReject} disabled={busy || (!reason.trim() && selectedTags.length === 0)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject completely
            </OSButton>
          </div>
        </div>
      ) : null}

      {actionable && blockers.length ? (
        <p className="mt-3 text-xs text-rose-300">Not platform-ready — fix the blocker(s) above (send back to Crina) before approving.</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {actionable ? (
          <>
            <OSButton onClick={onApprove} disabled={busy || blockers.length > 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {pending ? "Approve selected platform" : "Approve / update selected platform"}
            </OSButton>
            <OSButton variant="secondary" onClick={onOpenReject} disabled={busy}>
              Request changes / Reject
            </OSButton>
          </>
        ) : null}
        <OSButton variant="secondary" onClick={onCopy}>
          <Copy className="h-4 w-4" />
          Copy text
        </OSButton>
        <OSButton variant="secondary" onClick={onDownload}>
          <Download className="h-4 w-4" />
          Export
        </OSButton>
      </div>
    </div>
  );
}
