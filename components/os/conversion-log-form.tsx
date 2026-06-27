"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { OSButton, OSField, OSInput, OSSelect } from "@/components/os/ui";
import type { Brand, Campaign } from "@/lib/types";

const FIELDS = ["awareness", "signups", "activations", "paid", "revenue"] as const;
type FieldKey = (typeof FIELDS)[number];

export function ConversionLogForm({ brands, campaigns }: { brands: Brand[]; campaigns: Campaign[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState("");
  const [vals, setVals] = useState<Record<FieldKey, string>>({ awareness: "", signups: "", activations: "", paid: "", revenue: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const brandCampaigns = campaigns.filter((c) => c.brand_id === brandId);

  async function submit() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/sales/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, campaign_id: campaignId || undefined, ...vals })
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "Failed to log.");
      setMsg("Logged — refreshing...");
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to log.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <OSField label="Brand">
          <OSSelect value={brandId} onChange={(e) => { setBrandId(e.target.value); setCampaignId(""); }}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </OSSelect>
        </OSField>
        <OSField label="Campaign (optional)">
          <OSSelect value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">— brand-level —</option>
            {brandCampaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </OSSelect>
        </OSField>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {FIELDS.map((k) => (
          <OSField key={k} label={k[0].toUpperCase() + k.slice(1)}>
            <OSInput type="number" min={0} value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} />
          </OSField>
        ))}
      </div>
      {msg ? <p className="text-sm text-neutral-400">{msg}</p> : null}
      <OSButton onClick={submit} disabled={saving || !brandId}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Log outcome
      </OSButton>
    </div>
  );
}
