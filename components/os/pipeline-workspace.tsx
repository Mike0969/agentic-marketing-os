"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Eye, Loader2, Send, UserRoundCheck } from "lucide-react";
import { OSBadge, OSButton, OSPanel } from "@/components/os/ui";
import type { Brand, Campaign, ContentItem, ContentStatus } from "@/lib/types";

type DispatchResponse = {
  contentItem: ContentItem;
  output: { title: string; hook: string; body: string; CTA: string; editorNotes: string };
  fallback: boolean;
  provider: string;
  model?: string | null;
  routeOrigin?: string;
  error?: string | null;
};

type CampaignExecution = {
  campaign: Campaign;
  brand: Brand | null;
  items: ContentItem[];
  lane: LaneKey;
  currentOwner: string;
  nextOwner: string;
  fallback: boolean;
};

type LaneKey = "waiting" | "content" | "visual" | "crina_review" | "human_approval" | "publishing";

type Lane = {
  key: LaneKey;
  label: string;
  hint: string;
};

const lanes: Lane[] = [
  { key: "waiting", label: "Waiting for Crina", hint: "Approved objective, no plan yet" },
  { key: "content", label: "Content / SEO", hint: "Drafts, blog briefs, platform copy" },
  { key: "visual", label: "Visual / Video", hint: "Creative direction and assets" },
  { key: "crina_review", label: "Crina review", hint: "Internal quality and brand check" },
  { key: "human_approval", label: "Needs you", hint: "Final package approval only" },
  { key: "publishing", label: "Publishing prep", hint: "Draft package, no live posting" }
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
  if (status === "approval") return { status, approval_status: "pending", workflow_stage: "human_final_approval", current_owner: "Human", next_owner: "Crina" };
  if (status === "scheduled") return { status, approval_status: "approved", workflow_stage: "publishing_prep", current_owner: "Publishing Agent", next_owner: "Human" };
  if (status === "visual") return { status, approval_status: "not_requested", workflow_stage: "visual_creation", current_owner: "Visual & Video Agent", next_owner: "Crina" };
  if (status === "draft") return { status, approval_status: "not_requested", workflow_stage: "content_creation" };
  return { status, approval_status: "not_requested" };
}

function laneForCampaign(campaign: Campaign, items: ContentItem[]): LaneKey {
  if (campaign.status !== "active") return "waiting";
  if (!items.length) return "waiting";
  if (items.some((item) => item.status === "approval" || item.approval_status === "pending" || item.workflow_stage === "human_final_approval")) return "human_approval";
  if (items.some((item) => item.status === "scheduled" || item.workflow_stage === "publishing_prep" || item.workflow_stage === "scheduled")) return "publishing";
  if (items.some((item) => item.workflow_stage === "crina_final_review" || item.workflow_stage === "crina_content_review")) return "crina_review";
  if (items.some((item) => item.status === "visual" || item.workflow_stage === "visual_creation")) return "visual";
  return "content";
}

function currentOwnerFor(items: ContentItem[], lane: LaneKey) {
  if (lane === "waiting") return "Crina";
  if (lane === "human_approval") return "You";
  if (lane === "publishing") return "Publishing Agent";

  const owners = new Map<string, number>();
  for (const item of items) {
    const owner = item.current_owner || item.assigned_agent || "Crina";
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
  }

  return [...owners.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Crina";
}

function nextOwnerFor(items: ContentItem[], lane: LaneKey) {
  if (lane === "waiting") return "Content Creator / SEO";
  if (lane === "content") return "Crina review";
  if (lane === "visual") return "Crina final review";
  if (lane === "crina_review") return "You";
  if (lane === "human_approval") return "Publishing Agent";
  return "Draft package";
}

function stageLabel(key: LaneKey) {
  return lanes.find((lane) => lane.key === key)?.label ?? "In execution";
}

function activeStatuses(item: ContentItem) {
  return ["idea", "brief", "draft", "visual", "approval", "scheduled"].includes(item.status);
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
  const [items, setItems] = useState(contentItems.filter(activeStatuses));
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);

  const executions = useMemo<CampaignExecution[]>(() => {
    return campaigns
      .filter((campaign) => campaign.status === "active")
      .map((campaign) => {
        const campaignItems = items.filter((item) => item.campaign_id === campaign.id);
        const lane = laneForCampaign(campaign, campaignItems);
        return {
          campaign,
          brand: brandMap.get(campaign.brand_id) ?? null,
          items: campaignItems,
          lane,
          currentOwner: currentOwnerFor(campaignItems, lane),
          nextOwner: nextOwnerFor(campaignItems, lane),
          fallback: campaignItems.some(fallbackMarked)
        };
      })
      .sort((a, b) => {
        const aTime = a.campaign.created_at ? new Date(a.campaign.created_at).getTime() : new Date(a.campaign.start_date).getTime();
        const bTime = b.campaign.created_at ? new Date(b.campaign.created_at).getTime() : new Date(b.campaign.start_date).getTime();
        return bTime - aTime;
      });
  }, [brandMap, campaigns, items]);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(executions[0]?.campaign.id ?? null);
  const selectedExecution = executions.find((execution) => execution.campaign.id === selectedCampaignId) ?? executions[0] ?? null;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(selectedExecution?.items[0]?.id ?? null);
  const selectedItem = selectedExecution?.items.find((item) => item.id === selectedItemId) ?? selectedExecution?.items[0] ?? null;
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<DispatchResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function selectExecution(execution: CampaignExecution) {
    setSelectedCampaignId(execution.campaign.id);
    setSelectedItemId(execution.items[0]?.id ?? null);
  }

  function updateItem(updated: ContentItem) {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)).filter(activeStatuses));
    setSelectedItemId(updated.id);
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
      setLastRun(payload);
      setMessage(payload.fallback ? `FALLBACK draft created after ${payload.provider} failed.` : `${payload.provider} draft created and saved.`);
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

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {lanes.map((lane) => {
            const laneExecutions = executions.filter((execution) => execution.lane === lane.key);
            return (
              <OSPanel key={lane.key} className="min-h-80 p-3">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-neutral-100">{lane.label}</h2>
                    <p className="mt-1 text-xs leading-5 text-neutral-600">{lane.hint}</p>
                  </div>
                  <OSBadge tone="off">{laneExecutions.length}</OSBadge>
                </div>
                <div className="space-y-3">
                  {laneExecutions.map((execution) => (
                    <CampaignPipelineCard
                      key={execution.campaign.id}
                      execution={execution}
                      selected={selectedExecution?.campaign.id === execution.campaign.id}
                      onSelect={() => selectExecution(execution)}
                    />
                  ))}
                  {!laneExecutions.length ? <div className="rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-600">No campaigns</div> : null}
                </div>
              </OSPanel>
            );
          })}
        </div>

        <OSPanel className="h-fit">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-neutral-100">Campaign detail</h2>
            {selectedExecution?.fallback ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
          </div>
          {selectedExecution ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-600">{selectedExecution.brand?.name ?? "Unknown brand"}</div>
                <div className="mt-1 text-lg font-semibold text-neutral-50">{selectedExecution.campaign.title}</div>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{selectedExecution.campaign.objective.replace(/^Objective:\s*/i, "").split(/\n\s*Source material \/ notes:/i)[0]}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Current owner" value={selectedExecution.currentOwner} />
                <Detail label="Next owner" value={selectedExecution.nextOwner} />
                <Detail label="Stage" value={stageLabel(selectedExecution.lane)} />
                <Detail label="Pieces" value={`${selectedExecution.items.length || 0}`} />
              </div>

              <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">Plan pieces</div>
                <div className="mt-3 space-y-2">
                  {selectedExecution.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className={`w-full rounded-md border p-3 text-left transition ${
                        selectedItem?.id === item.id ? "border-neutral-500 bg-neutral-900" : "border-neutral-800 bg-neutral-950 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <OSBadge tone="off">{item.platform}</OSBadge>
                        <OSBadge tone="info">{item.status}</OSBadge>
                        {fallbackMarked(item) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm font-medium text-neutral-100">{item.title}</div>
                      <div className="mt-1 text-xs text-neutral-500">{item.current_owner || item.assigned_agent}</div>
                    </button>
                  ))}
                  {!selectedExecution.items.length ? (
                    <div className="rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
                      No Crina plan exists yet. Start it from Campaign Objectives.
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedItem ? (
                <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">Selected piece</div>
                      <div className="mt-1 text-sm font-semibold text-neutral-100">{selectedItem.title}</div>
                    </div>
                    {fallbackMarked(selectedItem) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                  </div>
                  <div className="mt-3 space-y-3">
                    <Detail label="Hook" value={selectedItem.hook || "Not set"} />
                    <Detail label="Draft / direction" value={selectedItem.body || "No draft yet."} tall />
                    <Detail label="CTA" value={selectedItem.CTA || "Not set"} />
                    {selectedItem.performance_summary ? <Detail label="Run note" value={selectedItem.performance_summary} tall /> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(selectedItem.status === "idea" || selectedItem.status === "brief") ? (
                      <OSButton onClick={() => sendToAgent(selectedItem)} disabled={dispatchingId === selectedItem.id}>
                        {dispatchingId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Start agent draft
                      </OSButton>
                    ) : null}
                    {nextStatus[selectedItem.status] ? (
                      <OSButton variant="secondary" onClick={() => moveItem(selectedItem, nextStatus[selectedItem.status]!)} disabled={movingId === selectedItem.id}>
                        {movingId === selectedItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        Move to next stage
                      </OSButton>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">No active campaign execution yet. Approve a campaign objective first.</p>
          )}

          {lastRun ? (
            <div className="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-neutral-200">Last agent output</div>
                <OSBadge tone={lastRun.fallback ? "warn" : "ok"}>{lastRun.fallback ? "FALLBACK" : lastRun.provider}</OSBadge>
              </div>
              <div className="mt-1 text-xs text-neutral-600">{lastRun.model ? `${lastRun.provider}/${lastRun.model}` : lastRun.provider}</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{lastRun.output.editorNotes}</p>
            </div>
          ) : null}
        </OSPanel>
      </div>
    </div>
  );
}

function CampaignPipelineCard({ execution, selected, onSelect }: { execution: CampaignExecution; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${selected ? "border-neutral-500 bg-neutral-900" : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-700"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-neutral-500">{execution.brand?.name ?? "Unknown brand"}</div>
          <h3 className="mt-1 line-clamp-3 text-sm font-semibold leading-5 text-neutral-100">{execution.campaign.title}</h3>
        </div>
        {execution.fallback ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
      </div>
      <div className="mt-3 space-y-2 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <UserRoundCheck className="h-3.5 w-3.5" />
          <span>{execution.currentOwner}</span>
        </div>
        <div>{execution.items.length} plan piece{execution.items.length === 1 ? "" : "s"}</div>
        <div>Next: {execution.nextOwner}</div>
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300">
        Inspect <Eye className="h-3.5 w-3.5" />
      </div>
    </button>
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
