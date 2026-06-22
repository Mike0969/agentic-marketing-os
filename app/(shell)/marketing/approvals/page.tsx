"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { OSBadge, OSButton, OSMetric, OSPanel, PageHeading, OSTextarea } from "@/components/os/ui";

type QueueItem = {
  id: string;
  type: string;
  status: string;
  content: {
    seo_brief?: {
      title?: string;
      keywords?: string[];
      summary?: string;
      draft?: string;
      cta?: string;
    };
    topic?: string;
    crina_review?: {
      decision?: string;
      reason?: string;
      improvements?: string[];
    };
    fallback_used?: boolean;
  };
  agent_id: string | null;
  crina_verdict: string | null;
  crina_reason: string | null;
  loop_iteration: number | null;
  created_at: string;
};

function preview(item: QueueItem) {
  const brief = item.content?.seo_brief;
  return {
    title: brief?.title || item.content?.topic || "SEO brief",
    keywords: brief?.keywords ?? [],
    summary: brief?.summary || brief?.draft || "No summary provided.",
    cta: brief?.cta
  };
}

export default function MarketingApprovalsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function loadApprovals() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/marketing/approvals", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load approvals.");
      setItems(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load approvals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApprovals();
  }, []);

  const stats = useMemo(() => {
    const fallback = items.filter((item) => item.content?.fallback_used).length;
    return { total: items.length, fallback };
  }, [items]);

  async function decide(item: QueueItem, decision: "approved" | "rejected") {
    const reason = reasons[item.id]?.trim();
    if (decision === "rejected" && !reason) {
      setRejectingId(item.id);
      return;
    }

    setActingId(item.id);
    setError(null);
    try {
      const response = await fetch("/api/marketing/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_id: item.id, decision, reason })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Decision failed.");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setRejectingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Approvals"
        subtitle="Human approval gate for Crina-reviewed SEO loop outputs. Approval never publishes live."
        action={
          <OSButton variant="secondary" onClick={loadApprovals} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </OSButton>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Waiting" value={stats.total} hint="Pending human decision" />
        <OSMetric label="Fallback" value={stats.fallback} hint="Needs extra scrutiny" />
        <OSMetric label="Gate" value="Human" hint="No auto-posting" />
      </div>

      {error ? (
        <OSPanel className="mb-4 border-rose-500/30">
          <OSBadge tone="danger">Error</OSBadge>
          <p className="mt-3 text-sm text-rose-200">{error}</p>
        </OSPanel>
      ) : null}

      {loading ? (
        <OSPanel>
          <p className="text-sm text-neutral-400">Loading approval queue...</p>
        </OSPanel>
      ) : items.length === 0 ? (
        <OSPanel>
          <p className="text-sm text-neutral-400">Nothing waiting for your approval</p>
        </OSPanel>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const data = preview(item);
            const isRejecting = rejectingId === item.id;
            return (
              <OSPanel key={item.id} className="space-y-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <OSBadge tone="info">{item.type.replaceAll("_", " ")}</OSBadge>
                      {item.content?.fallback_used ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                      <OSBadge tone="ok">Crina reviewed {item.loop_iteration ?? 1}x</OSBadge>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-neutral-50">{data.title}</h2>
                    {data.keywords.length ? (
                      <p className="mt-2 text-xs uppercase tracking-wider text-neutral-500">Keywords: {data.keywords.join(", ")}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <OSButton disabled={actingId === item.id} onClick={() => decide(item, "approved")}>
                      <Check className="h-4 w-4" />
                      Approve
                    </OSButton>
                    <OSButton variant="danger" disabled={actingId === item.id} onClick={() => (isRejecting ? decide(item, "rejected") : setRejectingId(item.id))}>
                      <X className="h-4 w-4" />
                      Reject
                    </OSButton>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                  <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Content preview</div>
                    <p className="mt-2 line-clamp-6 text-sm leading-6 text-neutral-300">{data.summary}</p>
                    {data.cta ? <p className="mt-3 text-sm text-neutral-400">CTA: {data.cta}</p> : null}
                  </div>
                  <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-4">
                    <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Crina reason</div>
                    <p className="mt-2 text-sm leading-6 text-neutral-300">{item.crina_reason || item.content?.crina_review?.reason || "Crina approved this for your review."}</p>
                  </div>
                </div>

                {isRejecting ? (
                  <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-4">
                    <label className="text-xs font-medium uppercase tracking-wider text-rose-300">Reason for rejection</label>
                    <OSTextarea
                      className="mt-2"
                      value={reasons[item.id] ?? ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Tell Crina what to remake: weak hook, wrong audience, missing proof, CTA too weak..."
                    />
                    <div className="mt-3 flex gap-2">
                      <OSButton variant="danger" disabled={actingId === item.id} onClick={() => decide(item, "rejected")}>
                        Send rejection to memory
                      </OSButton>
                      <OSButton variant="secondary" onClick={() => setRejectingId(null)}>
                        Cancel
                      </OSButton>
                    </div>
                  </div>
                ) : null}
              </OSPanel>
            );
          })}
        </div>
      )}
    </>
  );
}
