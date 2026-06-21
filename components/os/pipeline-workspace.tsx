"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Eye, Loader2, Send } from "lucide-react";
import { OSBadge, OSButton, OSPanel } from "@/components/os/ui";
import type { Brand, Campaign, ContentItem, ContentStatus } from "@/lib/types";

type DispatchResponse = {
  contentItem: ContentItem;
  output: { title: string; hook: string; body: string; CTA: string; editorNotes: string };
  fallback: boolean;
  provider: string;
  error?: string | null;
};

type Column = {
  key: "idea" | "draft" | "visual" | "approval" | "scheduled";
  label: string;
  statuses: ContentStatus[];
};

const columns: Column[] = [
  { key: "idea", label: "Idea", statuses: ["idea", "brief"] },
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "visual", label: "Visual", statuses: ["visual"] },
  { key: "approval", label: "Approval", statuses: ["approval"] },
  { key: "scheduled", label: "Scheduled", statuses: ["scheduled"] }
];

const nextStatus: Partial<Record<ContentStatus, ContentStatus>> = {
  idea: "draft",
  brief: "draft",
  draft: "visual",
  visual: "approval",
  approval: "scheduled"
};

function fallbackMarked(item: ContentItem) {
  return item.performance_summary?.toUpperCase().includes("FALLBACK") ?? false;
}

function statusPatch(status: ContentStatus) {
  if (status === "approval") return { status, approval_status: "pending" };
  if (status === "scheduled") return { status, approval_status: "approved" };
  return { status, approval_status: "not_requested" };
}

export function PipelineWorkspace({
  contentItems,
  brands,
  campaigns
}: {
  contentItems: ContentItem[];
  brands: Brand[];
  campaigns: Campaign[];
}) {
  const [items, setItems] = useState(contentItems.filter((item) => columns.some((column) => column.statuses.includes(item.status))));
  const [selected, setSelected] = useState<ContentItem | null>(items[0] ?? null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<DispatchResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const campaignMap = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);

  function updateItem(updated: ContentItem) {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)).filter((item) => columns.some((column) => column.statuses.includes(item.status))));
    setSelected((current) => (current?.id === updated.id ? updated : current));
  }

  async function sendToAgent(item: ContentItem) {
    setDispatchingId(item.id);
    setMessage(null);
    setLastRun(null);

    try {
      const response = await fetch(`/api/marketing/content-items/${item.id}/dispatch`, { method: "POST" });
      const payload = (await response.json()) as DispatchResponse & { error?: string };
      if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Agent dispatch failed.");
      updateItem(payload.contentItem);
      setSelected(payload.contentItem);
      setLastRun(payload);
      setMessage(payload.fallback ? "FALLBACK draft created. Hermes did not return usable output." : "Hermes draft created and saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent dispatch failed.");
    } finally {
      setDispatchingId(null);
    }
  }

  async function moveItem(item: ContentItem, status: ContentStatus) {
    setMovingId(item.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/content-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusPatch(status))
      });
      const payload = (await response.json()) as { contentItem?: ContentItem; error?: string };
      if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Pipeline move failed.");
      updateItem(payload.contentItem);
      setMessage(`${payload.contentItem.title} moved to ${payload.contentItem.status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pipeline move failed.");
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_0.75fr]">
        <div className="grid gap-4 lg:grid-cols-5">
          {columns.map((column) => {
            const columnItems = items.filter((item) => column.statuses.includes(item.status));
            return (
              <OSPanel key={column.key} className="min-h-80 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-neutral-100">{column.label}</h2>
                  <OSBadge tone="off">{columnItems.length}</OSBadge>
                </div>
                <div className="space-y-3">
                  {columnItems.map((item) => (
                    <PipelineCard
                      key={item.id}
                      item={item}
                      brandName={brandMap.get(item.brand_id)?.name ?? "Unknown brand"}
                      campaignName={campaignMap.get(item.campaign_id)?.title ?? "No campaign"}
                      selected={selected?.id === item.id}
                      dispatching={dispatchingId === item.id}
                      moving={movingId === item.id}
                      onSelect={() => setSelected(item)}
                      onDispatch={() => sendToAgent(item)}
                      onMove={nextStatus[item.status] ? () => moveItem(item, nextStatus[item.status]!) : undefined}
                    />
                  ))}
                  {!columnItems.length ? <div className="rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-600">No cards</div> : null}
                </div>
              </OSPanel>
            );
          })}
        </div>

        <OSPanel className="h-fit">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-neutral-100">Card detail</h2>
            {selected && fallbackMarked(selected) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
          </div>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-600">Title</div>
                <div className="mt-1 text-lg font-semibold text-neutral-50">{selected.title}</div>
              </div>
              <Detail label="Brand" value={brandMap.get(selected.brand_id)?.name ?? "Unknown brand"} />
              <Detail label="Campaign" value={campaignMap.get(selected.campaign_id)?.title ?? "No campaign"} />
              <Detail label="Assigned agent" value={selected.assigned_agent} />
              <Detail label="Hook" value={selected.hook || "Not set"} />
              <Detail label="Draft / body" value={selected.body || "No draft yet."} tall />
              <Detail label="CTA" value={selected.CTA || "Not set"} />
              {selected.performance_summary ? <Detail label="Run note" value={selected.performance_summary} tall /> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Select a card to inspect it.</p>
          )}
          {lastRun ? (
            <div className="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-neutral-200">Last agent output</div>
                <OSBadge tone={lastRun.fallback ? "warn" : "ok"}>{lastRun.fallback ? "FALLBACK" : "Hermes"}</OSBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{lastRun.output.editorNotes}</p>
            </div>
          ) : null}
        </OSPanel>
      </div>
    </div>
  );
}

function PipelineCard({
  item,
  brandName,
  campaignName,
  selected,
  dispatching,
  moving,
  onSelect,
  onDispatch,
  onMove
}: {
  item: ContentItem;
  brandName: string;
  campaignName: string;
  selected: boolean;
  dispatching: boolean;
  moving: boolean;
  onSelect: () => void;
  onDispatch: () => void;
  onMove?: () => void;
}) {
  const canDispatch = item.status === "idea" || item.status === "brief";

  return (
    <div className={`rounded-md border p-3 ${selected ? "border-neutral-500 bg-neutral-900" : "border-neutral-800 bg-neutral-950/50"}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-3 text-sm font-semibold leading-5 text-neutral-100">{item.title}</h3>
        {fallbackMarked(item) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
      </div>
      <div className="mt-2 space-y-1 text-xs text-neutral-500">
        <div>{brandName}</div>
        <div className="line-clamp-1">{campaignName}</div>
        <div>{item.assigned_agent}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={onSelect}>
          <Eye className="h-3.5 w-3.5" />
          View
        </OSButton>
        {canDispatch ? (
          <OSButton className="px-2 py-1 text-xs" onClick={onDispatch} disabled={dispatching}>
            {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send
          </OSButton>
        ) : null}
        {onMove ? (
          <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={onMove} disabled={moving}>
            {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Move
          </OSButton>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ label, value, tall = false }: { label: string; value: string; tall?: boolean }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">{label}</div>
      <div className={`mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-300 ${tall ? "" : "line-clamp-4"}`}>{value}</div>
    </div>
  );
}
