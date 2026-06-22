"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, Plus, Save, ShieldCheck, Sparkles } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";
import type { Brand, Campaign, CampaignStatus } from "@/lib/types";

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

export function CampaignWorkspace({ campaigns, brands }: { campaigns: Campaign[]; brands: Brand[] }) {
  const [items, setItems] = useState(campaigns);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CampaignForm>(() => emptyForm(brands));
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [reworkId, setReworkId] = useState<string | null>(null);
  const [reworkReasons, setReworkReasons] = useState<Record<string, string>>({});
  const [savedReasons, setSavedReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const brandMap = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);

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
      const payload = (await response.json()) as { contentItems?: unknown[]; alreadyStarted?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Crina could not start this campaign.");

      const count = payload.contentItems?.length ?? 0;
      setMessage(
        payload.alreadyStarted
          ? "Crina already created Pipeline items for this campaign. Open Pipeline to continue."
          : `Crina created ${count} campaign item${count === 1 ? "" : "s"} in Pipeline. Open Pipeline to see what she is working on.`
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
          <p className="mt-1 text-sm text-neutral-500">One objective becomes angles, platform drafts, visuals, calendar, final review, and draft publishing prep.</p>
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

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((campaign) => {
          const brand = brandMap.get(campaign.brand_id);
          const label = statusOptions.find((option) => option.value === campaign.status)?.label ?? campaign.status;

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
                <OSBadge tone={statusTone[campaign.status]}>{label}</OSBadge>
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
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Direction is approved. Crina should create the first campaign ideas and move them into Pipeline.</span>
                  </div>
                  <div className="mt-3">
                    <OSButton onClick={() => startCrina(campaign)} disabled={executingId === campaign.id}>
                      {executingId === campaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {executingId === campaign.id ? "Crina is creating..." : "Start Crina / create Pipeline items"}
                    </OSButton>
                  </div>
                </div>
              ) : null}
            </OSPanel>
          );
        })}
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
