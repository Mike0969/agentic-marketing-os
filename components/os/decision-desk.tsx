"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, RefreshCw, X } from "lucide-react";
import { OSBadge, OSButton, OSPanel, OSTextarea } from "@/components/os/ui";
import type { Brand, Campaign, ContentItem } from "@/lib/types";

function firstObjectiveLine(objective: string) {
  return objective
    .replace(/^Objective:\s*/i, "")
    .split(/\n\s*(Source material \/ notes:|Platforms:|Primary CTA \/ offer:)/i)[0]
    .trim();
}

function fallbackMarked(item: ContentItem) {
  return item.performance_summary?.toUpperCase().includes("FALLBACK") ?? false;
}

export function DecisionDesk({
  campaigns,
  contentItems,
  brands
}: {
  campaigns: Campaign[];
  contentItems: ContentItem[];
  brands: Brand[];
}) {
  const [directionCampaigns, setDirectionCampaigns] = useState(campaigns);
  const [finalItems, setFinalItems] = useState(contentItems);
  const [actingId, setActingId] = useState<string | null>(null);
  const [reasonForId, setReasonForId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);

  async function approveDirection(campaign: Campaign) {
    setActingId(campaign.id);
    setMessage(null);

    try {
      const statusResponse = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active", feedback_reason: "Campaign direction approved for Crina execution." })
      });
      const statusPayload = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(statusPayload.error ?? "Could not approve campaign direction.");

      const executeResponse = await fetch(`/api/marketing/campaigns/${campaign.id}/execute`, { method: "POST" });
      const executePayload = await executeResponse.json();
      if (!executeResponse.ok) throw new Error(executePayload.error ?? "Direction approved, but Crina could not start.");

      setDirectionCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      setMessage(
        executePayload.alreadyStarted
          ? `${campaign.title} was already started by Crina. Open Pipeline to inspect it.`
          : `${campaign.title} approved. Crina created ${executePayload.contentItems?.length ?? 0} plan pieces.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not approve campaign direction.");
    } finally {
      setActingId(null);
    }
  }

  async function sendDirectionBack(campaign: Campaign) {
    const reason = reasons[campaign.id]?.trim();
    if (!reason) {
      setReasonForId(campaign.id);
      setMessage("Add a reason so Crina can learn what to remake.");
      return;
    }

    setActingId(campaign.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused", feedback_reason: reason })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not send campaign back to Crina.");

      setDirectionCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      setReasonForId(null);
      setMessage(`${campaign.title} was sent back to Crina with your reason.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send campaign back to Crina.");
    } finally {
      setActingId(null);
    }
  }

  async function decideFinal(item: ContentItem, decision: "approved" | "changes_requested") {
    const reason = reasons[item.id]?.trim();
    if (decision === "changes_requested" && !reason) {
      setReasonForId(item.id);
      setMessage("Add a reason so Crina and the agents can learn what to remake.");
      return;
    }

    setActingId(item.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/approvals/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gate: "gate_2",
          decision,
          feedback: reason,
          requested_by_agent: "Crina"
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not record approval decision.");

      setFinalItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setReasonForId(null);
      const when = payload.contentItem?.scheduled_at ? new Date(payload.contentItem.scheduled_at).toLocaleString() : null;
      setMessage(
        decision === "approved"
          ? when
            ? `${item.title} approved — Crina scheduled it for ${when}.`
            : `${item.title} moved to publishing prep.`
          : `${item.title} was sent back to Crina for rework.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record approval decision.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-semibold text-neutral-50">Gate 1: Campaign direction</h2>
            <p className="mt-1 text-sm text-neutral-500">Approve the objective once. Crina starts only after this gate.</p>
          </div>
          <Link href="/marketing/campaigns" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 hover:text-neutral-50">
            Open campaigns <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {directionCampaigns.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {directionCampaigns.map((campaign) => {
              const brand = brandMap.get(campaign.brand_id);
              const isReasonOpen = reasonForId === campaign.id;
              return (
                <OSPanel key={campaign.id} className="space-y-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <OSBadge tone="info">Direction approval</OSBadge>
                        <OSBadge tone="off">{brand?.name ?? "Unknown brand"}</OSBadge>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-neutral-50">{campaign.title}</h3>
                      <p className="mt-2 line-clamp-4 text-sm leading-6 text-neutral-300">{firstObjectiveLine(campaign.objective)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <OSButton disabled={actingId === campaign.id} onClick={() => approveDirection(campaign)}>
                        {actingId === campaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Approve direction
                      </OSButton>
                      <OSButton variant="danger" disabled={actingId === campaign.id} onClick={() => (isReasonOpen ? sendDirectionBack(campaign) : setReasonForId(campaign.id))}>
                        <X className="h-4 w-4" />
                        Send back
                      </OSButton>
                    </div>
                  </div>
                  {isReasonOpen ? (
                    <ReasonBox
                      value={reasons[campaign.id] ?? ""}
                      onChange={(value) => setReasons((current) => ({ ...current, [campaign.id]: value }))}
                      onCancel={() => setReasonForId(null)}
                      onSubmit={() => sendDirectionBack(campaign)}
                      disabled={actingId === campaign.id}
                      submitLabel="Send back to Crina"
                      placeholder="Example: wrong audience, weak CTA, too generic, missing proof, wrong platform mix..."
                    />
                  ) : null}
                </OSPanel>
              );
            })}
          </div>
        ) : (
          <OSPanel>
            <p className="text-sm text-neutral-400">No campaign directions are waiting. Create or edit objectives in Campaigns.</p>
          </OSPanel>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-semibold text-neutral-50">Gate 2: Final review before publishing prep</h2>
            <p className="mt-1 text-sm text-neutral-500">Approve only when Crina has assembled the final package. Approval moves to draft publishing prep, not live posting.</p>
          </div>
          <Link href="/marketing/pipeline" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 hover:text-neutral-50">
            Open pipeline <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {finalItems.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {finalItems.map((item) => {
              const brand = brandMap.get(item.brand_id);
              const isReasonOpen = reasonForId === item.id;
              return (
                <OSPanel key={item.id} className="space-y-4">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <OSBadge tone="warn">Final approval</OSBadge>
                        <OSBadge tone="off">{brand?.name ?? "Unknown brand"}</OSBadge>
                        {fallbackMarked(item) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-neutral-50">{item.title}</h3>
                      <p className="mt-2 line-clamp-4 text-sm leading-6 text-neutral-300">{item.body || item.hook || "No preview available."}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <OSButton disabled={actingId === item.id} onClick={() => decideFinal(item, "approved")}>
                        {actingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Approve final
                      </OSButton>
                      <OSButton variant="danger" disabled={actingId === item.id} onClick={() => (isReasonOpen ? decideFinal(item, "changes_requested") : setReasonForId(item.id))}>
                        <RefreshCw className="h-4 w-4" />
                        Request changes
                      </OSButton>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Info label="Platform" value={item.platform} />
                    <Info label="Current owner" value={item.current_owner || "You"} />
                    <Info label="CTA" value={item.CTA || "Not set"} />
                    <Info label="Crina note" value={item.crina_review_notes || item.performance_summary || "Crina marked this ready for final review."} />
                  </div>
                  {isReasonOpen ? (
                    <ReasonBox
                      value={reasons[item.id] ?? ""}
                      onChange={(value) => setReasons((current) => ({ ...current, [item.id]: value }))}
                      onCancel={() => setReasonForId(null)}
                      onSubmit={() => decideFinal(item, "changes_requested")}
                      disabled={actingId === item.id}
                      submitLabel="Send back to Crina"
                      placeholder="Example: hook is weak, visual direction is wrong, timing is wrong, CTA weak, not enough proof..."
                    />
                  ) : null}
                </OSPanel>
              );
            })}
          </div>
        ) : (
          <OSPanel>
            <p className="text-sm text-neutral-400">No final packages are waiting for approval.</p>
          </OSPanel>
        )}
      </section>
    </div>
  );
}

function ReasonBox({
  value,
  onChange,
  onCancel,
  onSubmit,
  disabled,
  submitLabel,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  disabled: boolean;
  submitLabel: string;
  placeholder: string;
}) {
  return (
    <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-4">
      <label className="text-xs font-medium uppercase tracking-wider text-rose-300">Reason required for learning memory</label>
      <OSTextarea className="mt-2" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <div className="mt-3 flex gap-2">
        <OSButton variant="danger" disabled={disabled || !value.trim()} onClick={onSubmit}>
          {submitLabel}
        </OSButton>
        <OSButton variant="secondary" onClick={onCancel}>
          Cancel
        </OSButton>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">{label}</div>
      <div className="mt-1 line-clamp-3 text-sm leading-6 text-neutral-300">{value}</div>
    </div>
  );
}
