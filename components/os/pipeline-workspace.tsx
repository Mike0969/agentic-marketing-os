"use client";

import { useMemo, useState } from "react";
import { Eye, UserRoundCheck } from "lucide-react";
import { OSBadge, OSPanel } from "@/components/os/ui";
import type { Brand, Campaign, ContentItem } from "@/lib/types";

// Read-only operational tracking. Crina runs the internal agent loop automatically; this view only
// answers "where is my campaign now?" — it is not a control panel and not an approval screen.
// Final approval happens on Ready to Post.

type CampaignExecution = {
  campaign: Campaign;
  brand: Brand | null;
  items: ContentItem[];
  lane: LaneKey;
  currentOwner: string;
  nextOwner: string;
  fallback: boolean;
  safetyBlocked: boolean;
  score: string | null;
};

type LaneKey = "waiting" | "content" | "visual" | "crina_review" | "human_approval" | "publishing";

type Lane = { key: LaneKey; label: string; hint: string };

const lanes: Lane[] = [
  { key: "waiting", label: "Waiting for Crina", hint: "Selected idea, plan not started" },
  { key: "content", label: "Content / SEO", hint: "Crina + Content drafting" },
  { key: "visual", label: "Visual / Video", hint: "Crina + Visual creating assets" },
  { key: "crina_review", label: "Crina review", hint: "Internal quality + brand check" },
  { key: "human_approval", label: "Needs you", hint: "Final package approval" },
  { key: "publishing", label: "Publishing prep", hint: "Draft package, no live posting" }
];

function fallbackMarked(item: ContentItem) {
  return (item.performance_summary?.toUpperCase().includes("FALLBACK") ?? false) || Boolean(item.ready_package?.fallback_used);
}

function safetyMarked(item: ContentItem) {
  return (item.crina_review_notes?.toUpperCase().includes("SAFETY-BLOCKED") ?? false) || item.approval_status === "changes_requested";
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

function nextOwnerFor(lane: LaneKey) {
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

// Latest Crina score chip across a campaign's pieces (e.g. "92/100 · 3 round(s) · pass").
function latestScore(items: ContentItem[]): string | null {
  for (const item of items) {
    if (item.crina_review_notes && /\d+\/100/.test(item.crina_review_notes)) return item.crina_review_notes;
  }
  return null;
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
  const items = useMemo(() => contentItems.filter(activeStatuses), [contentItems]);
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
          nextOwner: nextOwnerFor(lane),
          fallback: campaignItems.some(fallbackMarked),
          safetyBlocked: campaignItems.some(safetyMarked),
          score: latestScore(campaignItems)
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

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-400">
        Read-only tracking — Crina runs the agent loop automatically. Approve final packages in Ready to Post.
      </div>

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
                      onSelect={() => {
                        setSelectedCampaignId(execution.campaign.id);
                        setSelectedItemId(execution.items[0]?.id ?? null);
                      }}
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
            <div className="flex gap-1.5">
              {selectedExecution?.safetyBlocked ? <OSBadge tone="danger">Safety blocked</OSBadge> : null}
              {selectedExecution?.fallback ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
            </div>
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
                <Detail label="State" value={stageLabel(selectedExecution.lane)} />
                <Detail label="Latest Crina score" value={selectedExecution.score ?? "Not scored yet"} />
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
                        {item.crina_review_notes && /\d+\/100/.test(item.crina_review_notes) ? <OSBadge tone={item.crina_review_notes.includes("pass") ? "ok" : "off"}>{item.crina_review_notes}</OSBadge> : null}
                        {safetyMarked(item) ? <OSBadge tone="danger">Safety</OSBadge> : null}
                        {fallbackMarked(item) ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm font-medium text-neutral-100">{item.title}</div>
                      <div className="mt-1 text-xs text-neutral-500">{item.current_owner || item.assigned_agent}</div>
                    </button>
                  ))}
                  {!selectedExecution.items.length ? (
                    <div className="rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
                      No Crina plan yet. Start it from Campaigns.
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
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">No active campaign yet. Start one from Campaigns.</p>
          )}
        </OSPanel>
      </div>
    </div>
  );
}

function CampaignPipelineCard({
  execution,
  selected,
  onSelect
}: {
  execution: CampaignExecution;
  selected: boolean;
  onSelect: () => void;
}) {
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          {execution.safetyBlocked ? <OSBadge tone="danger">Safety</OSBadge> : null}
          {execution.fallback ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
        </div>
      </div>
      <div className="mt-3 space-y-2 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <UserRoundCheck className="h-3.5 w-3.5" />
          <span>{execution.currentOwner}</span>
        </div>
        <div>{execution.items.length} plan piece{execution.items.length === 1 ? "" : "s"}</div>
        <div>Next: {execution.nextOwner}</div>
        {execution.score ? <div className="text-neutral-400">Score: {execution.score}</div> : null}
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300">
        Click to inspect <Eye className="h-3.5 w-3.5" />
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
