"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui";
import { contentStatuses, type ContentItem } from "@/lib/types";

const statusLabels: Record<string, string> = {
  idea: "Idea",
  brief: "Brief",
  draft: "Draft",
  visual: "Visual",
  approval: "Approval",
  scheduled: "Scheduled",
  published: "Published",
  analyzed: "Analyzed"
};

const approvalTone: Record<string, "neutral" | "green" | "amber" | "red"> = {
  not_requested: "neutral",
  pending: "amber",
  approved: "green",
  rejected: "red",
  changes_requested: "amber"
};

export function PipelineBoard({ items, brandNames }: { items: ContentItem[]; brandNames: Record<string, string> }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function dispatch(item: ContentItem) {
    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch("/api/agents/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId: item.id })
      });
      if (!response.ok) throw new Error(`Dispatch failed (HTTP ${response.status}).`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dispatch failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? <div className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}
      <div className="grid gap-4 overflow-x-auto pb-3 xl:grid-cols-4 2xl:grid-cols-8">
        {contentStatuses.map((status) => {
          const columnItems = items.filter((item) => item.status === status);
          return (
            <section key={status} className="min-h-[360px] min-w-72 rounded-lg border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{statusLabels[status]}</h2>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">{columnItems.length}</span>
              </div>
              <div className="space-y-3">
                {columnItems.map((item) => {
                  const canDispatch = (status === "idea" || status === "brief") && busyId !== item.id;
                  return (
                    <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-command">{brandNames[item.brand_id]}</div>
                      <h3 className="mt-2 text-sm font-semibold leading-5">{item.title}</h3>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{item.platform}</span>
                        <span>{item.content_type}</span>
                      </div>
                      {item.hook ? <p className="mt-3 line-clamp-2 text-xs italic text-slate-600 dark:text-slate-400">“{item.hook}”</p> : null}
                      {(status === "draft" || status === "visual") && item.body ? (
                        <p className="mt-2 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{item.body}</p>
                      ) : null}
                      <div className="mt-4 text-xs text-slate-500">Assigned to</div>
                      <div className="mt-1 text-sm font-medium">{item.assigned_agent}</div>
                      {item.scheduled_at ? (
                        <div className="mt-2 text-xs text-slate-500">Suggested: {new Date(item.scheduled_at).toLocaleString()} (manual — no auto-post)</div>
                      ) : null}
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <Badge tone={approvalTone[item.approval_status] ?? "neutral"}>{item.approval_status.replaceAll("_", " ")}</Badge>
                        {status === "idea" || status === "brief" ? (
                          <button
                            type="button"
                            onClick={() => dispatch(item)}
                            disabled={!canDispatch}
                            className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-950 px-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
                            title={`Run ${item.assigned_agent} on this approved idea`}
                          >
                            {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            {busyId === item.id ? "Working…" : "Send to agent"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
