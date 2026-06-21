"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { CampaignStatusBadge } from "@/components/status";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand, Campaign } from "@/lib/types";

export function CampaignManager({ brands, campaigns }: { brands: Brand[]; campaigns: Campaign[] }) {
  const router = useRouter();
  const [items, setItems] = useState(campaigns);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    brand_id: brands[0]?.id ?? "",
    title: "",
    objective: "",
    target_audience: "",
    start_date: "2026-06-16",
    end_date: "2026-07-16"
  });

  async function createCampaign() {
    if (!form.title.trim()) return;
    setIsCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) throw new Error("Could not create campaign.");

      const result = (await response.json()) as { campaign: Campaign };
      setItems((current) => [result.campaign, ...current]);
      setForm((current) => ({ ...current, title: "", objective: "", target_audience: "" }));
      setMessage(`${result.campaign.title} created.`);
      router.refresh();
      // TODO: Trigger Crina campaign planning through Hermes or n8n after campaign creation.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create campaign.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
      <div className="space-y-4">
      <Panel>
        <h2 className="text-lg font-semibold">Manual campaign record</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
          Optional admin fallback. Normal planning starts in Workflows with Crina; this form is only for saving a known campaign container or correcting records.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium">
            Brand
            <select className={`${inputClass} mt-2`} value={form.brand_id} onChange={(event) => setForm({ ...form, brand_id: event.target.value })}>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Title
            <input className={`${inputClass} mt-2`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Objective
            <textarea className={`${inputClass} mt-2 min-h-24`} value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Target audience
            <textarea
              className={`${inputClass} mt-2 min-h-20`}
              value={form.target_audience}
              onChange={(event) => setForm({ ...form, target_audience: event.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Start
              <input type="date" className={`${inputClass} mt-2`} value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
            </label>
            <label className="block text-sm font-medium">
              End
              <input type="date" className={`${inputClass} mt-2`} value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
            </label>
          </div>
          <button type="button" className={buttonClass} onClick={createCampaign} disabled={!form.title.trim() || isCreating}>
            <Plus className="mr-2 h-4 w-4" />
            {isCreating ? "Saving..." : "Save manual campaign record"}
          </button>
          {!form.title.trim() ? <p className="text-xs text-slate-500">Add a title to enable manual save.</p> : null}
          {message ? <div className="rounded-md bg-slate-100 p-3 text-sm font-medium text-slate-700 dark:bg-slate-950 dark:text-slate-200">{message}</div> : null}
        </div>
      </Panel>
      </div>

      <div className="space-y-4">
        {items.map((campaign) => {
          const brand = brands.find((item) => item.id === campaign.brand_id);
          return (
            <Panel key={campaign.id}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-lg font-semibold">{campaign.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{brand?.name}</p>
                </div>
                <CampaignStatusBadge status={campaign.status} />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">{campaign.objective}</p>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Audience</div>
                  <div className="mt-1">{campaign.target_audience}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Start</div>
                  <div className="mt-1">{campaign.start_date}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">End</div>
                  <div className="mt-1">{campaign.end_date}</div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
