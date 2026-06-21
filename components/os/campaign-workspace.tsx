"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { CalendarDays, Loader2, Plus, Save } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";
import type { Brand, Campaign, CampaignStatus } from "@/lib/types";

type CampaignForm = {
  brand_id: string;
  title: string;
  objective: string;
  target_audience: string;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
};

const statusOptions: Array<{ value: CampaignStatus; label: string }> = [
  { value: "planning", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
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
    target_audience: "",
    start_date: today,
    end_date: end,
    status: "planning"
  };
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
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = (await response.json()) as { campaign?: Campaign; error?: string };

      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "Campaign creation failed.");

      setItems((current) => [payload.campaign!, ...current]);
      setForm(emptyForm(brands));
      setShowCreate(false);
      setMessage("Campaign created and saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign creation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(campaign: Campaign, status: CampaignStatus) {
    setUpdatingId(campaign.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = (await response.json()) as { campaign?: Campaign; error?: string };

      if (!response.ok || !payload.campaign) throw new Error(payload.error ?? "Campaign status update failed.");

      setItems((current) => current.map((item) => (item.id === payload.campaign!.id ? payload.campaign! : item)));
      setMessage(`${payload.campaign.title} is now ${statusOptions.find((option) => option.value === payload.campaign!.status)?.label ?? payload.campaign.status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign status update failed.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-neutral-50">Campaign register</h2>
          <p className="mt-1 text-sm text-neutral-500">Manual creation is available for admin setup. Crina-created work can attach to these campaigns later.</p>
        </div>
        <OSButton onClick={() => setShowCreate((current) => !current)}>
          <Plus className="h-4 w-4" />
          New campaign
        </OSButton>
      </div>

      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      {showCreate ? (
        <OSPanel>
          <form onSubmit={createCampaign} className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div>
                <h3 className="font-semibold text-neutral-100">Create campaign</h3>
                <p className="mt-1 text-sm text-neutral-500">Saved to Supabase when configured, otherwise local fallback.</p>
              </div>
              <OSBadge tone="info">Draft</OSBadge>
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
              <OSField label="Campaign title">
                <OSInput name="title" value={form.title} onChange={updateForm} required />
              </OSField>
              <OSField label="Objective">
                <OSTextarea name="objective" value={form.objective} onChange={updateForm} required />
              </OSField>
              <OSField label="Target audience">
                <OSTextarea name="target_audience" value={form.target_audience} onChange={updateForm} required />
              </OSField>
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
                Save campaign
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
                  <p className="mt-4 text-sm leading-6 text-neutral-300">{campaign.objective}</p>
                </div>
                <OSBadge tone={statusTone[campaign.status]}>{label}</OSBadge>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Info label="Audience" value={campaign.target_audience} />
                <Info label="Start" value={campaign.start_date} icon />
                <Info label="End" value={campaign.end_date} icon />
              </div>

              <div className="mt-4 max-w-xs">
                <OSField label="Status">
                  <OSSelect value={campaign.status} onChange={(event) => updateStatus(campaign, event.target.value as CampaignStatus)} disabled={updatingId === campaign.id}>
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </OSSelect>
                </OSField>
              </div>
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
