"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquare, X } from "lucide-react";
import { ApprovalStatusBadge } from "@/components/status";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand, ContentItem } from "@/lib/types";

type Decision = "approved" | "rejected" | "changes_requested";

export function ApprovalQueue({ brands, contentItems }: { brands: Brand[]; contentItems: ContentItem[] }) {
  const router = useRouter();
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const [items, setItems] = useState(contentItems.filter((item) => item.status === "approval" || item.approval_status === "pending"));
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(item: ContentItem, decision: Decision) {
    setSavingId(item.id);
    setMessage(null);

    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentItemId: item.id,
          decision,
          feedback: feedback[item.id] ?? "",
          requestedByAgent: item.assigned_agent
        })
      });

      if (!response.ok) throw new Error("Could not record approval decision.");

      await response.json();
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setMessage(`${item.title} marked ${decision.replaceAll("_", " ")}.`);
      router.refresh();
      // TODO: Notify Publishing Agent or Content Creator Agent through Hermes/n8n.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record approval decision.");
    } finally {
      setSavingId(null);
    }
  }

  if (items.length === 0) {
    return <Panel>No content is waiting for approval.</Panel>;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <Panel key={item.id}>
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-command">{brandMap.get(item.brand_id)?.name}</div>
                  <h2 className="mt-2 text-xl font-semibold">{item.title}</h2>
                  <div className="mt-1 text-sm text-slate-500">{item.platform} · {item.content_type} · {item.assigned_agent}</div>
                </div>
                <ApprovalStatusBadge status={item.approval_status} />
              </div>
              <div className="mt-5 rounded-md bg-slate-50 p-4 dark:bg-slate-950">
                <div className="text-sm font-semibold">Hook</div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.hook}</p>
                <div className="mt-4 text-sm font-semibold">Draft body</div>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.body}</p>
                <div className="mt-4 text-sm font-semibold">CTA</div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.CTA}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium">
                Feedback
                <textarea
                  className={`${inputClass} mt-2 min-h-32`}
                  value={feedback[item.id] ?? ""}
                  onChange={(event) => setFeedback({ ...feedback, [item.id]: event.target.value })}
                  placeholder="Add decision notes for the agent..."
                />
              </label>
              <div className="mt-4 grid gap-2">
                <button type="button" className={buttonClass} onClick={() => decide(item, "approved")} disabled={savingId === item.id}>
                  <Check className="mr-2 h-4 w-4" />
                  {savingId === item.id ? "Saving..." : "Approve"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                  onClick={() => decide(item, "changes_requested")}
                  disabled={savingId === item.id}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Request changes
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
                  onClick={() => decide(item, "rejected")}
                  disabled={savingId === item.id}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </Panel>
      ))}
      {message ? <div className="rounded-md bg-slate-100 p-3 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</div> : null}
    </div>
  );
}
