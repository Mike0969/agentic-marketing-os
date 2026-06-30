"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, Loader2, XCircle } from "lucide-react";
import { OSBadge, OSButton, OSPanel, OSTextarea } from "@/components/os/ui";
import { REJECT_REASONS } from "@/lib/marketing/reject-reasons";
import type { Brand, Campaign, ContentAsset, ContentItem, ReadyPackage } from "@/lib/types";

type Props = {
  brands: Brand[];
  campaigns: Campaign[];
  contentItems: ContentItem[];
  assets: ContentAsset[];
};

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

export function ReadyToPostWorkspace({ brands, campaigns, contentItems, assets }: Props) {
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
  const [message, setMessage] = useState<string | null>(null);
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const campaignMap = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);
  const assetsByItem = useMemo(() => {
    const grouped = new Map<string, ContentAsset[]>();
    for (const asset of assetItems) {
      grouped.set(asset.content_item_id, [...(grouped.get(asset.content_item_id) ?? []), asset]);
    }
    return grouped;
  }, [assetItems]);

  const grouped = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of items) {
      map.set(item.campaign_id, [...(map.get(item.campaign_id) ?? []), item]);
    }
    return [...map.entries()];
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
          body: JSON.stringify({ decision, feedback, gate: "gate_2", requested_by_agent: "Crina" })
        });
        const payload = (await response.json()) as { contentItem?: ContentItem; error?: string };
        if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Decision failed.");
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
        setRejectId(null);
        setMessage("Approved — added to the schedule.");
      } else {
        // Reject / request changes → Crina reroutes to Visual or Content and regenerates a better version.
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
          setReworkedIds((current) => ({ ...current, [item.id]: true }));
          setReasons((current) => ({ ...current, [item.id]: "" }));
          setTags((current) => ({ ...current, [item.id]: [] }));
          setMessage(`Crina reworked it (routed to ${(payload.routedTo ?? ["Content"]).join(" + ")}). The new version is ready — review it again.`);
        } finally {
          setReworkingIds((current) => ({ ...current, [item.id]: false }));
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Decision failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyPackage(item: ContentItem) {
    const pkg = packageFor(item);
    await navigator.clipboard.writeText([pkg.title, pkg.text, pkg.caption, pkg.body, pkg.hashtags?.join(" ")].filter(Boolean).join("\n\n"));
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
      {grouped.map(([campaignId, campaignItems]) => {
        const campaign = campaignMap.get(campaignId);
        const brand = campaign ? brandMap.get(campaign.brand_id) : null;
        return (
          <OSPanel key={campaignId}>
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500">{brand?.name ?? "Unknown brand"}</div>
                <h2 className="mt-1 text-lg font-semibold text-neutral-50">{campaign?.title ?? "Campaign package"}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-400">Preview, approve, request changes, reject, copy, or export. No live posting occurs.</p>
              </div>
              <OSBadge tone="warn">{campaignItems.filter((item) => item.approval_status === "pending").length} need decision</OSBadge>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {campaignItems.map((item) => (
                <ReadyCard
                  key={item.id}
                  item={item}
                  assets={assetsByItem.get(item.id) ?? []}
                  generatingAssets={generatingAssetIds[item.id] ?? false}
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
                />
              ))}
            </div>
          </OSPanel>
        );
      })}
      {!grouped.length ? (
        <OSPanel>
          <p className="text-sm text-neutral-500">No ready-to-post packages yet. Approve a campaign objective, then let Crina run the internal loop to final review.</p>
        </OSPanel>
      ) : null}
    </div>
  );
}

function ReadyCard({
  item,
  assets,
  generatingAssets,
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
  onDownload
}: {
  item: ContentItem;
  assets: ContentAsset[];
  generatingAssets: boolean;
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
}) {
  const pkg = packageFor(item);
  const pending = item.approval_status === "pending" || item.workflow_stage === "human_final_approval";
  const isVideo = `${item.platform} ${item.content_type}`.toLowerCase().includes("video");
  const imageAssets = assets.filter((asset) => asset.url);
  const primaryImage = imageAssets[0]?.url ?? item.visual_asset_url;

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
        ) : (
          <OSBadge tone={item.approval_status === "approved" ? "ok" : "off"}>{item.approval_status}</OSBadge>
        )}
        {fallbackMarked(item) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
        {item.crina_review_notes ? <OSBadge tone={item.crina_review_notes.includes("pass") ? "ok" : "off"}>Crina {item.crina_review_notes}</OSBadge> : null}
        {primaryImage ? <OSBadge tone="ok">Image ready</OSBadge> : <OSBadge tone="demo">DRAFT ASSET</OSBadge>}
        {generatingAssets ? <OSBadge tone="info">Generating slides</OSBadge> : null}
        {isVideo ? <OSBadge tone="demo">VIDEO COMING SOON</OSBadge> : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primaryImage} alt={pkg.alt_text ?? item.title} className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center bg-neutral-950 text-sm text-neutral-600">Draft asset placeholder</div>
        )}
        {imageAssets.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto border-t border-neutral-800 p-2">
            {imageAssets.map((asset) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={asset.id} src={asset.url!} alt={`Slide ${asset.position}`} className="h-20 w-20 shrink-0 rounded object-cover" />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900/70 p-3">
        <div className="text-sm font-semibold text-neutral-50">{pkg.title ?? item.title}</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{pkg.text}</p>
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
          <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Tap what&apos;s wrong (one tap = structured feedback Crina learns from). Free text optional.</p>
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
            <OSButton variant="danger" onClick={onReject} disabled={busy || (!reason.trim() && selectedTags.length === 0)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject
            </OSButton>
            <OSButton variant="secondary" onClick={onRequestChanges} disabled={busy || (!reason.trim() && selectedTags.length === 0)}>
              Request changes
            </OSButton>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {pending ? (
          <>
            <OSButton onClick={onApprove} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve
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
