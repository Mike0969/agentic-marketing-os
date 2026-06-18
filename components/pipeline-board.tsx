"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import type { ContentItem } from "@/lib/types";

const platformOptions = ["LinkedIn", "X", "Instagram", "Facebook", "TikTok", "YouTube", "Blog"];

const approvalTone: Record<string, "neutral" | "green" | "amber" | "red"> = {
  not_requested: "neutral",
  pending: "amber",
  approved: "green",
  rejected: "red",
  changes_requested: "amber"
};

const approvalLabels: Record<string, string> = {
  not_requested: "No approval yet",
  pending: "Needs human approval",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested"
};

const queueLabels = {
  content_creation: "Content writing",
  crina_content_review: "Crina review",
  visual_creation: "Visual creation",
  crina_final_review: "Crina final review",
  human_final_approval: "Waiting for you",
  publishing_prep: "Publishing prep",
  scheduled: "Ready / scheduled draft",
  rework: "Needs rework"
} as const;

const queueHelp = {
  content_creation: "Content Creator is writing the approved plan.",
  crina_content_review: "Crina is checking strategy, brand fit, and platform fit.",
  visual_creation: "Visual & Video is preparing image, carousel, or video direction.",
  crina_final_review: "Crina is reviewing the full content package.",
  human_final_approval: "Crina sent the final package to Approvals.",
  publishing_prep: "Publishing Agent is preparing the manual draft package.",
  scheduled: "Approved draft package with suggested posting time. No live posting.",
  rework: "Rejected or changes requested. Crina should route the fix."
} as const;

type DispatchResponse = {
  ok: boolean;
  agent: string;
  provider: "hermes" | "deterministic";
  fallback?: boolean;
  error: string | null;
};

export function PipelineBoard({ items, brandNames }: { items: ContentItem[]; brandNames: Record<string, string> }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingPlatformId, setSavingPlatformId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "green" | "amber"; text: string } | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  const brands = Array.from(new Set(items.map((item) => item.brand_id))).map((id) => ({ id, name: brandNames[id] ?? id }));
  const allActiveItems = items.filter((item) => {
    const isRawCrinaProposal = (item.status === "idea" || item.status === "brief") && item.approval_status === "not_requested";
    const isDone = item.workflow_stage === "done" || item.status === "published" || item.status === "analyzed";
    return !isRawCrinaProposal && !isDone;
  });
  const filteredItems = brandFilter === "all" ? items : items.filter((item) => item.brand_id === brandFilter);
  const activeItems = brandFilter === "all" ? allActiveItems : allActiveItems.filter((item) => item.brand_id === brandFilter);
  const queues = {
    content_creation: activeItems.filter((item) => item.workflow_stage === "content_creation"),
    crina_content_review: activeItems.filter((item) => item.workflow_stage === "crina_content_review"),
    visual_creation: activeItems.filter((item) => item.workflow_stage === "visual_creation"),
    crina_final_review: activeItems.filter((item) => item.workflow_stage === "crina_final_review"),
    human_final_approval: activeItems.filter((item) => item.workflow_stage === "human_final_approval" || (!item.workflow_stage && item.approval_status === "pending")),
    publishing_prep: activeItems.filter((item) => item.workflow_stage === "publishing_prep"),
    scheduled: activeItems.filter((item) => item.workflow_stage === "scheduled" || (!item.workflow_stage && item.status === "scheduled")),
    rework: activeItems.filter((item) => item.workflow_stage === "rework" || item.approval_status === "rejected" || item.approval_status === "changes_requested")
  };
  const selectedItem = (selectedId ? activeItems.find((item) => item.id === selectedId) : null) ?? activeItems[0] ?? null;

  function getDecisionLabel(item: ContentItem) {
    if (item.workflow_stage === "content_creation") return `With ${item.current_owner ?? item.assigned_agent}`;
    if (item.workflow_stage === "crina_content_review") return "With Crina";
    if (item.workflow_stage === "visual_creation") return "With Visual & Video";
    if (item.workflow_stage === "crina_final_review") return "With Crina final review";
    if (item.workflow_stage === "human_final_approval") return "Waiting for you";
    if (item.workflow_stage === "publishing_prep") return "With Publishing";
    if (item.approval_status === "pending") return "Review in Approvals";
    if (item.approval_status === "approved") return "Approved";
    if (item.approval_status === "rejected") return "Rejected";
    if (item.approval_status === "changes_requested") return "Needs changes";
    if (item.status === "draft" || item.status === "visual") return "Agent producing";
    if (item.status === "idea" || item.status === "brief") return "Produce this idea";
    return "Inspect";
  }

  function getPlatforms(item: ContentItem) {
    return item.platform
      .split(",")
      .map((platform) => platform.trim())
      .filter(Boolean);
  }

  async function updatePlatforms(item: ContentItem, platforms: string[]) {
    if (platforms.length === 0) return;
    setSavingPlatformId(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/content-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, platforms })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Could not update platform (HTTP ${response.status}).`);
      setNotice({ tone: "green", text: `Platforms changed to ${platforms.join(", ")}.` });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update platform.");
    } finally {
      setSavingPlatformId(null);
    }
  }

  async function dispatch(item: ContentItem) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 190_000);
    try {
      const response = await fetch("/api/agents/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId: item.id }),
        signal: controller.signal
      });
      const result = (await response.json().catch(() => ({}))) as Partial<DispatchResponse> & { error?: string };
      if (!response.ok) throw new Error(result.error ?? `Dispatch failed (HTTP ${response.status}).`);
      const agent = result.agent ?? item.assigned_agent;
      const usedFallback = result.provider === "deterministic" || result.fallback;
      setNotice({
        tone: usedFallback ? "amber" : "green",
        text: usedFallback
          ? `${agent} wrote a deterministic fallback draft. Review quality before approval; Hermes/model did not complete this run.`
          : `${agent} finished through Hermes. The card moved forward and is now waiting for human approval.`
      });
      router.refresh();
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === "AbortError"
          ? "Agent run timed out in the browser after 190 seconds. Hermes may still be slow; try again or check Live Brain / Agent Brain logs."
          : cause instanceof Error
            ? cause.message
            : "Dispatch failed.";
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}
      {notice ? (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            notice.tone === "green"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          }`}
        >
          {notice.text}
        </div>
      ) : null}
      <div className="mb-4 grid gap-3 text-sm text-slate-600 md:grid-cols-4 dark:text-slate-300">
        {Object.entries(queueLabels).map(([key, label]) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-950 dark:text-white">{label}</div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{queues[key as keyof typeof queues].length}</span>
            </div>
            <p className="mt-1">{queueHelp[key as keyof typeof queueHelp]}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBrandFilter("all")}
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            brandFilter === "all"
              ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
              : "border-slate-200 bg-white text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
          }`}
        >
          All brands <span className="ml-1 text-xs opacity-70">{allActiveItems.length}</span>
        </button>
        {brands.map((brand) => {
          const count = allActiveItems.filter((item) => item.brand_id === brand.id).length;
          return (
            <button
              key={brand.id}
              type="button"
              onClick={() => {
                setBrandFilter(brand.id);
                setSelectedId(activeItems.find((item) => item.brand_id === brand.id)?.id ?? null);
              }}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                brandFilter === brand.id
                  ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                  : "border-slate-200 bg-white text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              }`}
            >
              {brand.name} <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(queueLabels) as Array<keyof typeof queueLabels>).map((queue) => {
            const sectionItems = queues[queue];
            return (
              <section key={queue} className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold">{queueLabels[queue]}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{queueHelp[queue]}</p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{sectionItems.length}</span>
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {sectionItems.length ? (
                    <div className="space-y-1.5">
                      {sectionItems.map((item) => {
                        const isSelected = selectedItem?.id === item.id;
                        const isBusy = busyId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`w-full rounded-md border p-2 text-left transition ${
                              isSelected
                                ? "border-command bg-command/10 dark:border-command dark:bg-command/15"
                                : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-900/70"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-command">{brandNames[item.brand_id]}</div>
                                <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{item.title}</div>
                              </div>
                              {isBusy ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-command" /> : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-950">{getPlatforms(item).join(" + ")}</span>
                              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-950">{getDecisionLabel(item)}</span>
                              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-950">{item.assigned_agent}</span>
                            </div>
                            {item.performance_summary ? <div className="mt-2 line-clamp-1 text-xs text-slate-500">{item.performance_summary}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">No cards in this section.</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {selectedItem ? (
            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-command">{brandNames[selectedItem.brand_id]}</div>
                  <h3 className="mt-2 text-lg font-semibold leading-6">{selectedItem.title}</h3>
                </div>
                <Badge tone={approvalTone[selectedItem.approval_status] ?? "neutral"}>{getDecisionLabel(selectedItem)}</Badge>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <span>What you decide</span>
                  <span className="text-right font-semibold text-slate-950 dark:text-white">{getDecisionLabel(selectedItem)}</span>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <label className="flex items-center justify-between gap-3">
                    <span>Platforms</span>
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      {savingPlatformId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin text-command" /> : null}
                      {platformOptions.map((platform) => {
                        const selectedPlatforms = getPlatforms(selectedItem);
                        const checked = selectedPlatforms.includes(platform);
                        return (
                          <label key={platform} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={savingPlatformId === selectedItem.id}
                              onChange={(event) => {
                                const next = event.target.checked ? [...selectedPlatforms, platform] : selectedPlatforms.filter((item) => item !== platform);
                                updatePlatforms(selectedItem, next);
                              }}
                            />
                            {platform}
                          </label>
                        );
                      })}
                    </span>
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <span>Workflow state</span>
                  <span className="text-right font-semibold text-slate-950 dark:text-white">
                    {selectedItem.approval_status === "pending"
                      ? "Waiting for your review"
                      : selectedItem.approval_status === "approved"
                        ? "Approved and out of active work"
                        : selectedItem.approval_status === "changes_requested" || selectedItem.approval_status === "rejected"
                          ? "Agent should remake it"
                          : selectedItem.status === "draft" || selectedItem.status === "visual"
                            ? "Agent producing"
                            : "Ready to produce"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <span>Working now</span>
                  <span className="text-right font-semibold text-slate-950 dark:text-white">{selectedItem.current_owner ?? selectedItem.assigned_agent}</span>
                </div>
                {selectedItem.performance_summary ? (
                  <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-900 dark:bg-blue-950 dark:text-blue-100">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em]">Execution status</div>
                    <p className="mt-1 text-sm">{selectedItem.performance_summary}</p>
                  </div>
                ) : null}
              </div>

              {selectedItem.hook ? (
                <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Hook</div>
                  <p className="mt-2 text-sm italic text-slate-700 dark:text-slate-300">“{selectedItem.hook}”</p>
                </div>
              ) : null}

              {selectedItem.body ? (
                <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Agent output / draft</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{selectedItem.body}</p>
                </div>
              ) : null}

              {selectedItem.CTA ? (
                <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">CTA</div>
                  <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">{selectedItem.CTA}</p>
                </div>
              ) : null}

              {selectedItem.scheduled_at ? (
                <div className="mt-4 text-xs text-slate-500">Suggested: {new Date(selectedItem.scheduled_at).toLocaleString()} (manual — no auto-post)</div>
              ) : null}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {selectedItem.status === "idea" || selectedItem.status === "brief" ? (
                  <button
                    type="button"
                    onClick={() => dispatch(selectedItem)}
                    disabled={busyId === selectedItem.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
                    title={`Run ${selectedItem.assigned_agent} on this card. Output returns here and then waits for approval.`}
                  >
                    {busyId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {busyId === selectedItem.id ? "Producing…" : "Produce this"}
                  </button>
                ) : null}
                {selectedItem.approval_status === "pending" ? (
                  <div className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-50 px-3 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <CheckCircle2 className="h-4 w-4" />
                    Review in Approvals
                  </div>
                ) : null}
                {selectedItem.approval_status === "rejected" || selectedItem.approval_status === "changes_requested" ? (
                  <button
                    type="button"
                    onClick={() => dispatch(selectedItem)}
                    disabled={busyId === selectedItem.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
                    title="Send this back to the assigned agent for a remake."
                  >
                    {busyId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    {busyId === selectedItem.id ? "Remaking…" : "Remake it"}
                  </button>
                ) : null}
                {selectedItem.approval_status === "approved" ? (
                  <div className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </div>
                ) : null}
              </div>

              {busyId === selectedItem.id ? (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Hermes/model run in progress. This can take 30-120 seconds; output will return to this card.
                </div>
              ) : null}
            </article>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              No active execution items. Crina proposals and finished drafts are handled in Approvals.
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
