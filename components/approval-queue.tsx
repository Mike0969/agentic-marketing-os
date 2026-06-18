"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquare, Send, X } from "lucide-react";
import { ApprovalStatusBadge } from "@/components/status";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand, ContentItem } from "@/lib/types";

type Decision = "approved" | "rejected" | "changes_requested";
const feedbackTagOptions = ["Content weak", "Hook weak", "Wrong tone", "Wrong platform", "Add platform", "Remove platform", "Visual weak", "Timing wrong", "CTA weak", "Needs proof"];

export function ApprovalQueue({ brands, contentItems }: { brands: Brand[]; contentItems: ContentItem[] }) {
  const router = useRouter();
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const [items, setItems] = useState(contentItems.filter((item) => isCrinaProposal(item) || item.status === "approval" || item.approval_status === "pending"));
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [feedbackTags, setFeedbackTags] = useState<Record<string, string[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedItem = (selectedId ? items.find((item) => item.id === selectedId) : null) ?? items[0] ?? null;
  const planItems = items.filter(isCrinaProposal);
  const draftItems = items.filter((item) => !isCrinaProposal(item));

  function isCrinaProposal(item: ContentItem) {
    return (item.status === "idea" || item.status === "brief") && item.approval_status === "not_requested";
  }

  async function approvePlan(item: ContentItem) {
    setSavingId(item.id);
    setMessage(null);

    try {
      const startResponse = await fetch("/api/content-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: "draft", approval_status: "not_requested" })
      });
      const startResult = (await startResponse.json().catch(() => ({}))) as { error?: string };
      if (!startResponse.ok) throw new Error(startResult.error ?? "Could not move proposal into production.");

      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setSelectedId((current) => (current === item.id ? null : current));
      setMessage(`${item.title} moved to Pipeline / In execution. The agent is producing it now.`);
      router.refresh();
      setSavingId(null);

      void fetch("/api/agents/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId: item.id })
      })
        .then(async (response) => {
          const result = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) throw new Error(result.error ?? "Could not send proposal to production.");
          setMessage(`${item.title} finished production and returned for final approval.`);
          router.refresh();
        })
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "Could not send proposal to production.");
          router.refresh();
        });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send proposal to production.");
      setSavingId(null);
    }
  }

  async function routePlanBack(item: ContentItem, decision: "changes_requested" | "rejected") {
    setSavingId(item.id);
    setMessage(null);

    try {
      const response = await fetch("/api/content-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          approval_status: decision,
          status: "brief",
          workflow_stage: "rework",
          current_owner: "Crina",
          human_feedback_tags: feedbackTags[item.id] ?? [],
          feedback: feedback[item.id] ?? "",
          performance_summary:
            decision === "rejected"
              ? feedback[item.id]
                ? `Human rejected Crina plan: ${feedback[item.id]}`
                : "Human rejected Crina plan."
              : feedback[item.id]
                ? `Human requested Crina plan changes: ${feedback[item.id]}`
                : "Human requested Crina plan changes."
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not route plan back to Crina.");

      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setMessage(decision === "rejected" ? `${item.title} rejected and routed to Crina learning.` : `${item.title} sent back to Crina for changes.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not route plan back to Crina.");
    } finally {
      setSavingId(null);
    }
  }

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
          feedbackTags: feedbackTags[item.id] ?? [],
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
    return <Panel>No Crina proposals or finished drafts are waiting for your decision.</Panel>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="grid gap-3 md:grid-cols-2">
        <ApprovalList title="Plan decisions" items={planItems} selectedId={selectedItem?.id ?? null} onSelect={setSelectedId} brandMap={brandMap} label="Approve to produce" />
        <ApprovalList title="Finished drafts" items={draftItems} selectedId={selectedItem?.id ?? null} onSelect={setSelectedId} brandMap={brandMap} label="Final review" />
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        {selectedItem ? (
          <Panel>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-command">{brandMap.get(selectedItem.brand_id)?.name}</div>
                <h2 className="mt-2 text-xl font-semibold">{selectedItem.title}</h2>
                <div className="mt-1 text-sm text-slate-500">
                  {isCrinaProposal(selectedItem) ? "Crina proposal" : "Finished draft"} · {selectedItem.platform} · {selectedItem.content_type}
                </div>
              </div>
              {isCrinaProposal(selectedItem) ? (
                <span className="rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">Plan decision</span>
              ) : (
                <ApprovalStatusBadge status={selectedItem.approval_status} />
              )}
            </div>

            <div className="mt-5 rounded-md bg-slate-50 p-4 dark:bg-slate-950">
              <div className="text-sm font-semibold">Hook</div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{selectedItem.hook}</p>
              <div className="mt-4 text-sm font-semibold">{isCrinaProposal(selectedItem) ? "Plan context" : "Draft body"}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-400">{selectedItem.body}</p>
              <div className="mt-4 text-sm font-semibold">CTA</div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{selectedItem.CTA}</p>
            </div>

            <label className="mt-4 block text-sm font-medium">
              Feedback
              <textarea
                className={`${inputClass} mt-2 min-h-28`}
                value={feedback[selectedItem.id] ?? ""}
                onChange={(event) => setFeedback({ ...feedback, [selectedItem.id]: event.target.value })}
                placeholder="Add decision notes for the agent..."
              />
            </label>
            <div className="mt-3">
              <div className="text-sm font-medium">Reason tags</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {feedbackTagOptions.map((tag) => {
                  const selected = feedbackTags[selectedItem.id]?.includes(tag) ?? false;
                  return (
                    <label
                      key={tag}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
                        selected
                          ? "border-command bg-command/10 text-command"
                          : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          const current = feedbackTags[selectedItem.id] ?? [];
                          const next = event.target.checked ? [...current, tag] : current.filter((item) => item !== tag);
                          setFeedbackTags({ ...feedbackTags, [selectedItem.id]: next });
                        }}
                      />
                      {tag}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {isCrinaProposal(selectedItem) ? (
                <>
                  <button type="button" className={buttonClass} onClick={() => approvePlan(selectedItem)} disabled={savingId === selectedItem.id}>
                    {savingId === selectedItem.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {savingId === selectedItem.id ? "Moving to execution..." : "Approve and produce"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                    onClick={() => routePlanBack(selectedItem, "changes_requested")}
                    disabled={savingId === selectedItem.id}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Request changes to Crina
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
                    onClick={() => routePlanBack(selectedItem, "rejected")}
                    disabled={savingId === selectedItem.id}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject plan
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className={buttonClass} onClick={() => decide(selectedItem, "approved")} disabled={savingId === selectedItem.id}>
                    <Check className="mr-2 h-4 w-4" />
                    {savingId === selectedItem.id ? "Saving..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                    onClick={() => decide(selectedItem, "changes_requested")}
                    disabled={savingId === selectedItem.id}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Request changes
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
                    onClick={() => decide(selectedItem, "rejected")}
                    disabled={savingId === selectedItem.id}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </button>
                </>
              )}
            </div>
          </Panel>
        ) : (
          <Panel>Select a title to review.</Panel>
        )}
      </aside>
      {message ? <div className="rounded-md bg-slate-100 p-3 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</div> : null}
    </div>
  );
}

function ApprovalList({
  title,
  items,
  selectedId,
  onSelect,
  brandMap,
  label
}: {
  title: string;
  items: ContentItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  brandMap: Map<string, Brand>;
  label: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{items.length}</span>
      </div>
      <div className="max-h-[560px] overflow-y-auto p-2">
        {items.length ? (
          <div className="space-y-1.5">
            {items.map((item) => {
              const selected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-full rounded-md border p-2 text-left transition ${
                    selected
                      ? "border-command bg-command/10 dark:border-command dark:bg-command/15"
                      : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white dark:bg-slate-900 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-command">{brandMap.get(item.brand_id)?.name}</div>
                  <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{item.title}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-950">{item.platform}</span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-950">{label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">Nothing waiting here.</div>
        )}
      </div>
    </section>
  );
}
