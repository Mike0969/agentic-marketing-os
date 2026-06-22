"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Loader2, Plus, Save, Search, ShieldCheck, Sparkles } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";
import type { Brand, Campaign, CampaignStatus, ContentItem } from "@/lib/types";

type CampaignForm = {
  brand_id: string;
  title: string;
  objective: string;
  source_material: string;
  platforms: string;
  primary_cta: string;
  target_audience: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
};

const statusOptions: Array<{ value: CampaignStatus; label: string }> = [
  { value: "planning", label: "Awaiting direction approval" },
  { value: "active", label: "Approved for execution" },
  { value: "paused", label: "Needs rework" },
  { value: "completed", label: "Completed" }
];

const statusTone: Record<CampaignStatus, "ok" | "warn" | "off" | "info"> = {
  planning: "info",
  active: "ok",
  paused: "warn",
  completed: "off"
};

function emptyForm(brands: Brand[]): CampaignForm {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString().slice(0, 10);
  return {
    brand_id: brands[0]?.id ?? "",
    title: "",
    objective: "",
    source_material: "",
    platforms: "LinkedIn, X, Instagram, Facebook, Blog",
    primary_cta: "",
    target_audience: "",
    start_date: today,
    end_date: end,
    status: "planning"
  };
}

function buildObjective(form: CampaignForm) {
  return [
    `Objective:\n${form.objective.trim()}`,
    form.source_material.trim() ? `Source material / notes:\n${form.source_material.trim()}` : "",
    form.platforms.trim() ? `Platforms:\n${form.platforms.trim()}` : "",
    form.primary_cta.trim() ? `Primary CTA / offer:\n${form.primary_cta.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function firstObjectiveLine(objective: string) {
  return objective
    .replace(/^Objective:\s*/i, "")
    .split(/\n\s*(Source material \/ notes:|Platforms:|Primary CTA \/ offer:)/i)[0]
    .trim();
}

function brandMark(name: string) {
  return name
    .split(/[\s/-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type ExecuteResponse = {
  contentItems?: ContentItem[];
  alreadyStarted?: boolean;
  fallback?: boolean;
  provider?: string;
  model?: string | null;
  error?: string;
};

const brandFilterAll = "all";
const statusFilterAll = "all";

export function CampaignWorkspace({
  campaigns,
  brands,
  contentItems
}: {
  campaigns: Campaign[];
  brands: Brand[];
  contentItems: ContentItem[];
}) {
  const [items, setItems] = useState(campaigns);
  const [planItems, setPlanItems] = useState(contentItems);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CampaignForm>(() => emptyForm(brands));
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [reworkId, setReworkId] = useState<string | null>(null);
  const [reworkReasons, setReworkReasons] = useState<Record<string, string>>({});
  const [savedReasons, setSavedReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState(brandFilterAll);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | typeof statusFilterAll>(statusFilterAll);
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const itemsByCampaign = useMemo(() => {
    const grouped = new Map<string, ContentItem[]>();
    for (const item of planItems) {
      if (!item.campaign_id) continue;
      const current = grouped.get(item.campaign_id) ?? [];
      current.push(item);
      grouped.set(item.campaign_id, current);
    }
    return grouped;
  }, [planItems]);

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...items]
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : new Date(a.start_date).getTime();
        const bTime = b.created_at ? new Date(b.created_at).getTime() : new Date(b.start_date).getTime();
        return bTime - aTime;
      })
      .filter((campaign) => {
        if (brandFilter !== brandFilterAll && campaign.brand_id !== brandFilter) return false;
        if (statusFilter !== statusFilterAll && campaign.status !== statusFilter) return false;
        if (!normalizedQuery) return true;
        const brand = brandMap.get(campaign.brand_id);
        return [campaign.title, campaign.objective, campaign.target_audience, brand?.name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [brandFilter, brandMap, items, query, statusFilter]);

  function updateForm(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const payloadBody = {
        ...form,
        objective: buildObjective(form),
        status: "planning" as CampaignStatus
      };
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody)
      });
      const payload = (await response.json()) as { campaign?: Campaign; error?: string };

      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "Campaign creation failed.");

      setItems((current) => [payload.campaign!, ...current]);
      setForm(emptyForm(brands));
      setShowCreate(false);
      setMessage("Campaign objective saved. Next step: direction approval before Crina executes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign creation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(campaign: Campaign, status: CampaignStatus, feedbackReason = "") {
    if (status === "paused" && !feedbackReason.trim()) {
      setReworkId(campaign.id);
      setMessage("Add a reason so Crina and the agents can learn before this objective goes to rework.");
      return;
    }

    setUpdatingId(campaign.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, feedback_reason: feedbackReason.trim() })
      });
      const payload = (await response.json()) as { campaign?: Campaign; error?: string };

      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "Campaign status update failed.");

      setItems((current) => current.map((item) => (item.id === payload.campaign!.id ? payload.campaign! : item)));
      if (status === "paused") {
        setSavedReasons((current) => ({ ...current, [campaign.id]: feedbackReason.trim() }));
        setReworkReasons((current) => ({ ...current, [campaign.id]: "" }));
        setReworkId(null);
        setMessage(`${payload.campaign.title} was sent back to Crina with your reason.`);
      } else if (status === "active") {
        setMessage(`${payload.campaign.title} is approved. Crina is creating the first campaign ideas now...`);
        await startCrina(payload.campaign);
      } else {
        setMessage(`${payload.campaign.title} is now ${statusOptions.find((option) => option.value === payload.campaign!.status)?.label ?? payload.campaign.status}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign status update failed.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function startCrina(campaign: Campaign) {
    setExecutingId(campaign.id);

    try {
      const response = await fetch(`/api/marketing/campaigns/${campaign.id}/execute`, { method: "POST" });
      const payload = (await response.json()) as ExecuteResponse;
      if (!response.ok) throw new Error(payload.error ?? "Crina could not start this campaign.");

      const count = payload.contentItems?.length ?? 0;
      if (payload.contentItems?.length) {
        setPlanItems((current) => {
          const incoming = new Map(payload.contentItems!.map((item) => [item.id, item]));
          const existing = current.filter((item) => !incoming.has(item.id));
          return [...payload.contentItems!, ...existing];
        });
      }
      setMessage(
        payload.alreadyStarted
          ? "Crina already created Pipeline items for this campaign. Open Pipeline to continue."
          : `${payload.fallback ? "FALLBACK: " : ""}Crina created ${count} campaign plan item${count === 1 ? "" : "s"} in Pipeline${payload.provider ? ` using ${payload.provider}${payload.model ? `/${payload.model}` : ""}` : ""}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Crina could not start this campaign.");
    } finally {
      setExecutingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <OSPanel className="border-cyan-500/20 bg-cyan-500/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-semibold text-neutral-50">Campaign direction gate</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Create the campaign objective here. Crina starts only after direction approval. Internal SEO, content, visual, and publishing-prep loops stay inside the system until the final package needs your review.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Rejected objectives do not disappear. They stay here as <span className="text-amber-300">Needs rework</span>, and your reason is saved as learning memory for Crina.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <OSBadge tone="info">Brand-scoped</OSBadge>
            <OSBadge tone="warn">Approval before execution</OSBadge>
            <OSBadge tone="off">No live posting</OSBadge>
          </div>
        </div>
      </OSPanel>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-neutral-50">Campaign objectives</h2>
          <p className="mt-1 text-sm text-neutral-500">One objective stays visible here while Crina turns it into angles, drafts, visuals, calendar, and final package.</p>
        </div>
        <OSButton onClick={() => setShowCreate((current) => !current)}>
          <Plus className="h-4 w-4" />
          Create Campaign Objective
        </OSButton>
      </div>

      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      {showCreate ? (
        <OSPanel>
          <form onSubmit={createCampaign} className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <h3 className="font-semibold text-neutral-100">Create campaign objective</h3>
                <p className="mt-1 text-sm text-neutral-500">Give Crina the campaign source, audience, channels, and CTA. This saves as a planning objective.</p>
              </div>
              <OSBadge tone="info">Awaiting direction approval</OSBadge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <OSField label="Brand">
                <OSSelect name="brand_id" value={form.brand_id} onChange={updateForm} required>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </OSSelect>
              </OSField>
              <OSField label="Campaign objective title">
                <OSInput name="title" value={form.title} onChange={updateForm} placeholder="Example: 7-day GridFactory investor infrastructure campaign" required />
              </OSField>
              <OSField label="Objective">
                <OSTextarea
                  name="objective"
                  value={form.objective}
                  onChange={updateForm}
                  placeholder="What must this campaign achieve? What should the audience believe or do after seeing it?"
                  required
                />
              </OSField>
              <OSField label="Target audience">
                <OSTextarea
                  name="target_audience"
                  value={form.target_audience}
                  onChange={updateForm}
                  placeholder="Who is this for? Be specific: investor, operator, driver, partner, buyer, regulator..."
                  required
                />
              </OSField>
              <OSField label="Source material / notes" hint="Paste a product update, transcript, blog idea, offer, or human notes for Crina.">
                <OSTextarea
                  name="source_material"
                  value={form.source_material}
                  onChange={updateForm}
                  placeholder="One source can become angles, posts, visuals, and a weekly calendar."
                />
              </OSField>
              <div className="grid gap-4">
                <OSField label="Platforms">
                  <OSInput name="platforms" value={form.platforms} onChange={updateForm} placeholder="LinkedIn, X, Instagram, Facebook, Blog, TikTok, YouTube" />
                </OSField>
                <OSField label="Primary CTA / offer">
                  <OSInput name="primary_cta" value={form.primary_cta} onChange={updateForm} placeholder="Book a demo, request capacity, join as driver, partner with us..." />
                </OSField>
              </div>
              <OSField label="Start date">
                <OSInput type="date" name="start_date" value={form.start_date} onChange={updateForm} required />
              </OSField>
              <OSField label="End date">
                <OSInput type="date" name="end_date" value={form.end_date} onChange={updateForm} required />
              </OSField>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <OSButton type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </OSButton>
              <OSButton type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save objective
              </OSButton>
            </div>
          </form>
        </OSPanel>
      ) : null}

      <OSPanel className="p-3">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <OSField label="Find campaign">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-600" />
              <OSInput className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, brand, audience, or objective..." />
            </div>
          </OSField>
          <OSField label="Brand">
            <OSSelect value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value={brandFilterAll}>All brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </OSSelect>
          </OSField>
          <OSField label="Stage">
            <OSSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CampaignStatus | typeof statusFilterAll)}>
              <option value={statusFilterAll}>All stages</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </OSSelect>
          </OSField>
        </div>
      </OSPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredCampaigns.map((campaign, index) => {
          const brand = brandMap.get(campaign.brand_id);
          const label = statusOptions.find((option) => option.value === campaign.status)?.label ?? campaign.status;
          const campaignPlanItems = itemsByCampaign.get(campaign.id) ?? [];
          const execution = summarizeExecution(campaign, campaignPlanItems, executingId === campaign.id);

          return (
            <OSPanel key={campaign.id}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-xs font-semibold text-neutral-200">
                      {brand ? brandMark(brand.name) : "??"}
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500">{brand?.name ?? "Unknown brand"}</div>
                      <h3 className="text-lg font-semibold text-neutral-50">{campaign.title}</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-neutral-300">{firstObjectiveLine(campaign.objective)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {index === 0 ? <OSBadge tone="info">Latest</OSBadge> : null}
                  <OSBadge tone={statusTone[campaign.status]}>{label}</OSBadge>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Info label="Audience" value={campaign.target_audience} />
                <Info label="Direction gate" value={campaign.status === "planning" ? "Needs approval before Crina starts" : campaign.status === "active" ? "Approved for Crina execution" : campaign.status === "paused" ? "Returned for rework" : "Closed"} />
                <Info label="Start" value={campaign.start_date} icon />
                <Info label="End" value={campaign.end_date} icon />
              </div>

              <div className="mt-4 max-w-xs">
                <OSField label="Operator stage">
                  <OSSelect
                    value={campaign.status}
                    onChange={(event) => {
                      const nextStatus = event.target.value as CampaignStatus;
                      if (nextStatus === "paused") {
                        setReworkId(campaign.id);
                        return;
                      }
                      updateStatus(campaign, nextStatus);
                    }}
                    disabled={updatingId === campaign.id}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </OSSelect>
                </OSField>
              </div>

              {reworkId === campaign.id ? (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <div>
                      <div className="text-sm font-medium text-amber-100">Why is this campaign direction rejected?</div>
                      <p className="mt-1 text-sm leading-6 text-neutral-400">
                        This reason is saved to feedback memory so Crina can avoid the same mistake next time.
                      </p>
                    </div>
                  </div>
                  <OSTextarea
                    className="mt-3"
                    value={reworkReasons[campaign.id] ?? ""}
                    onChange={(event) => setReworkReasons((current) => ({ ...current, [campaign.id]: event.target.value }))}
                    placeholder="Example: wrong target audience, weak CTA, too generic, missing proof, wrong platform mix, not aligned with brand tone..."
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <OSButton
                      variant="danger"
                      disabled={updatingId === campaign.id || !reworkReasons[campaign.id]?.trim()}
                      onClick={() => updateStatus(campaign, "paused", reworkReasons[campaign.id] ?? "")}
                    >
                      Send back to Crina with reason
                    </OSButton>
                    <OSButton variant="secondary" onClick={() => setReworkId(null)} disabled={updatingId === campaign.id}>
                      Cancel
                    </OSButton>
                  </div>
                </div>
              ) : null}

              {campaign.status === "paused" ? (
                <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                  <div className="font-medium">Needs rework</div>
                  <p className="mt-1 leading-6 text-neutral-300">
                    This campaign stays in Campaign Objectives until Crina receives revised direction.
                    {savedReasons[campaign.id] ? ` Last reason: ${savedReasons[campaign.id]}` : " The rejection reason is stored in feedback memory."}
                  </p>
                </div>
              ) : null}

              {campaign.status === "active" ? (
                <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{execution.message}</span>
                    </div>
                    <OSBadge tone={execution.tone}>{execution.label}</OSBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <OSButton onClick={() => startCrina(campaign)} disabled={executingId === campaign.id}>
                      {executingId === campaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {executingId === campaign.id ? "Crina is creating..." : campaignPlanItems.length ? "Refresh Crina plan" : "Start Crina plan"}
                    </OSButton>
                    {campaignPlanItems.length ? (
                      <Link
                        href="/marketing/pipeline"
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
                      >
                        Open Pipeline <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <CampaignPlanSummary items={campaignPlanItems} executing={executingId === campaign.id} />
            </OSPanel>
          );
        })}
        {!filteredCampaigns.length ? (
          <OSPanel className="xl:col-span-2">
            <div className="text-sm text-neutral-400">No campaign objectives match this search.</div>
          </OSPanel>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-600">
        {icon ? <CalendarDays className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <div className="mt-1 line-clamp-3 text-sm text-neutral-300">{value}</div>
    </div>
  );
}

function summarizeExecution(campaign: Campaign, items: ContentItem[], running: boolean) {
  if (running) {
    return {
      label: "Crina working",
      tone: "info" as const,
      message: "Crina is creating the campaign plan now. The campaign will stay here and the generated pieces will appear below."
    };
  }

  if (campaign.status !== "active") {
    return {
      label: "Not executing",
      tone: "off" as const,
      message: "This campaign is not in execution."
    };
  }

  if (!items.length) {
    return {
      label: "Waiting for Crina",
      tone: "warn" as const,
      message: "Direction is approved, but no Crina plan exists yet. Start Crina to create the first campaign plan and Pipeline work."
    };
  }

  const ownerCounts = new Map<string, number>();
  for (const item of items) {
    const owner = item.current_owner || item.assigned_agent || "Crina";
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }
  const owner = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Crina";
  const fallback = items.some((item) => item.performance_summary?.toUpperCase().includes("FALLBACK"));

  return {
    label: fallback ? "Plan created with fallback" : "Plan created",
    tone: fallback ? ("warn" as const) : ("ok" as const),
    message: `Crina created ${items.length} campaign piece${items.length === 1 ? "" : "s"}. Current owner: ${owner}. Open Pipeline when you want the execution view.`
  };
}

function CampaignPlanSummary({ items, executing }: { items: ContentItem[]; executing: boolean }) {
  if (!items.length && !executing) return null;

  const fallback = items.some((item) => item.performance_summary?.toUpperCase().includes("FALLBACK"));
  const owners = [...new Set(items.map((item) => item.current_owner || item.assigned_agent).filter(Boolean))].slice(0, 3);

  return (
    <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-100">Crina campaign plan</div>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            This is the work created from your objective. It stays attached to the campaign so it does not disappear into the board.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OSBadge tone={items.length ? "info" : "warn"}>{items.length ? `${items.length} pieces` : "Creating"}</OSBadge>
          {owners.length ? <OSBadge tone="off">Owner: {owners.join(", ")}</OSBadge> : null}
          {fallback ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
        </div>
      </div>

      {items.length ? (
        <div className="mt-4 space-y-2">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-md border border-neutral-800 bg-neutral-900/70 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <OSBadge tone="off">{item.platform}</OSBadge>
                    <OSBadge tone="info">{item.status}</OSBadge>
                    {item.workflow_stage ? <OSBadge tone="off">{workflowLabel(item.workflow_stage)}</OSBadge> : null}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-medium text-neutral-100">{item.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{item.hook}</div>
                </div>
                <div className="shrink-0 text-xs text-neutral-500 md:text-right">
                  <div>{item.current_owner || item.assigned_agent}</div>
                  {item.next_owner ? <div className="mt-1">Next: {item.next_owner}</div> : null}
                </div>
              </div>
            </div>
          ))}
          {items.length > 5 ? <div className="text-xs text-neutral-500">+{items.length - 5} more pieces in Pipeline.</div> : null}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">Crina is preparing the plan.</div>
      )}
    </div>
  );
}

function workflowLabel(stage: string) {
  return stage
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
