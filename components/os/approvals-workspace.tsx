"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { OSBadge, OSButton, OSField, OSPanel, OSTextarea } from "@/components/os/ui";
import type { Approval, Brand, Campaign, ContentItem } from "@/lib/types";

type ApprovalItem = ContentItem & {
  gate: "gate_1" | "gate_2";
  gateLabel: string;
};

function buildQueue(contentItems: ContentItem[]) {
  return contentItems
    .filter((item) => (item.status === "draft" && item.approval_status === "pending") || item.status === "approval")
    .map((item): ApprovalItem => {
      const gate = item.status === "draft" ? "gate_1" : "gate_2";
      return { ...item, gate, gateLabel: gate === "gate_1" ? "Gate 1 · Draft review" : "Gate 2 · Final review" };
    });
}

export function ApprovalsWorkspace({
  contentItems,
  approvals,
  brands,
  campaigns
}: {
  contentItems: ContentItem[];
  approvals: Approval[];
  brands: Brand[];
  campaigns: Campaign[];
}) {
  const [queue, setQueue] = useState<ApprovalItem[]>(() => buildQueue(contentItems));
  const [selectedId, setSelectedId] = useState(queue[0]?.id ?? "");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const campaignMap = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);
  const approvalMap = useMemo(() => new Map(approvals.map((approval) => [approval.content_item_id, approval])), [approvals]);
  const selected = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;

  async function decide(item: ApprovalItem, decision: "approved" | "rejected" | "changes_requested") {
    if (decision !== "approved" && !feedback.trim()) {
      setMessage("Please add a reason before rejecting or requesting changes.");
      return;
    }

    setBusy(decision);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/approvals/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          feedback,
          gate: item.gate,
          requested_by_agent: approvalMap.get(item.id)?.requested_by_agent ?? item.assigned_agent ?? "Crina"
        })
      });
      const payload = (await response.json()) as { contentItem?: ContentItem; error?: string };
      if (!response.ok || !payload.contentItem) throw new Error(payload.error ?? "Approval decision failed.");

      const nextQueue = queue.filter((queued) => queued.id !== item.id);
      setQueue(nextQueue);
      setSelectedId(nextQueue[0]?.id ?? "");
      setFeedback("");
      setMessage(
        decision === "approved"
          ? item.gate === "gate_1"
            ? "Gate 1 approved. Item moved to Visual."
            : "Gate 2 approved. Item moved to Scheduled draft."
          : "Feedback saved. Item moved back to Draft."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval decision failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.35fr]">
      <OSPanel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-100">Decision queue</h2>
            <p className="mt-1 text-sm text-neutral-500">Only work needing you appears here.</p>
          </div>
          <OSBadge tone="warn">{queue.length}</OSBadge>
        </div>
        <div className="space-y-2">
          {queue.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-md border p-3 text-left transition ${
                selected?.id === item.id ? "border-neutral-500 bg-neutral-900" : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-neutral-100">{item.title}</h3>
                <OSBadge tone={item.gate === "gate_1" ? "info" : "warn"}>{item.gate === "gate_1" ? "G1" : "G2"}</OSBadge>
              </div>
              <div className="mt-2 text-xs text-neutral-500">{brandMap.get(item.brand_id)?.name ?? "Unknown brand"}</div>
            </button>
          ))}
          {!queue.length ? <div className="rounded-md border border-dashed border-neutral-800 p-5 text-sm text-neutral-500">No content is waiting for approval.</div> : null}
        </div>
      </OSPanel>

      <OSPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <h2 className="font-semibold text-neutral-100">Review</h2>
            <p className="mt-1 text-sm text-neutral-500">Nothing publishes automatically. Approval only moves the card to the next internal stage.</p>
          </div>
          <OSBadge tone="danger">No live posting</OSBadge>
        </div>

        {message ? <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

        {selected ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <OSBadge tone={selected.gate === "gate_1" ? "info" : "warn"}>{selected.gateLabel}</OSBadge>
              {selected.performance_summary?.toUpperCase().includes("FALLBACK") ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-600">Title</div>
              <h3 className="mt-1 text-xl font-semibold text-neutral-50">{selected.title}</h3>
            </div>
            <ReviewBlock label="Brand" value={brandMap.get(selected.brand_id)?.name ?? "Unknown brand"} />
            <ReviewBlock label="Campaign" value={campaignMap.get(selected.campaign_id)?.title ?? "No campaign"} />
            <ReviewBlock label="Hook" value={selected.hook || "Not set"} />
            <ReviewBlock label="Draft / final package" value={selected.body || "No body yet."} tall />
            <ReviewBlock label="CTA" value={selected.CTA || "Not set"} />
            {selected.performance_summary ? <ReviewBlock label="Agent note" value={selected.performance_summary} tall /> : null}

            <OSField label="Reason / feedback">
              <OSTextarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Required for reject or request changes. Saved as learning context later." />
            </OSField>

            <div className="flex flex-wrap gap-2">
              <OSButton onClick={() => decide(selected, "approved")} disabled={Boolean(busy)}>
                {busy === "approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve
              </OSButton>
              <OSButton variant="secondary" onClick={() => decide(selected, "changes_requested")} disabled={Boolean(busy)}>
                {busy === "changes_requested" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Request changes
              </OSButton>
              <OSButton variant="danger" onClick={() => decide(selected, "rejected")} disabled={Boolean(busy)}>
                {busy === "rejected" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Reject
              </OSButton>
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-neutral-500">Select a queued item to review.</p>
        )}
      </OSPanel>
    </div>
  );
}

function ReviewBlock({ label, value, tall = false }: { label: string; value: string; tall?: boolean }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">{label}</div>
      <div className={`mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-300 ${tall ? "" : "line-clamp-4"}`}>{value}</div>
    </div>
  );
}
