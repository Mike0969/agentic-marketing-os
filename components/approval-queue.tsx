"use client";

import { useMemo, useState } from "react";
import { Check, MessageSquare, X } from "lucide-react";
import { ApprovalStatusBadge } from "@/components/status";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand, ContentItem } from "@/lib/types";

type Decision = "approved" | "rejected" | "changes_requested";

export function ApprovalQueue({ brands, contentItems }: { brands: Brand[]; contentItems: ContentItem[] }) {
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const [items, setItems] = useState(contentItems.filter((item) => item.status === "approval" || item.approval_status === "pending"));
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  function decide(id: string, decision: Decision) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, approval_status: decision, status: decision === "approved" ? "scheduled" : "draft" } : item)));
    // TODO: Persist Approval decision to Supabase and notify Publishing Agent or Content Creator Agent through n8n.
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
                <button type="button" className={buttonClass} onClick={() => decide(item.id, "approved")}>
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                  onClick={() => decide(item.id, "changes_requested")}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Request changes
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
                  onClick={() => decide(item.id, "rejected")}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
