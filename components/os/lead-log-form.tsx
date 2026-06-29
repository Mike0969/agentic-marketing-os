"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { OSButton, OSField, OSInput, OSSelect, OSTextarea } from "@/components/os/ui";
import type { Brand, Campaign } from "@/lib/types";

const segments = ["investor", "operator", "developer", "utility", "other"] as const;

export function LeadLogForm({ brands, campaigns }: { brands: Brand[]; campaigns: Campaign[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    segment: "investor",
    wants: "call",
    notes: ""
  });

  const brandCampaigns = campaigns.filter((c) => c.brand_id === brandId);

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/leads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, campaign_id: campaignId || undefined, ...form })
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "Failed to log lead.");
      setMsg("Lead logged — refreshing...");
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to log lead.");
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
            <option value="">- brand-level -</option>
            {brandCampaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </OSSelect>
        </OSField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <OSField label="Name">
          <OSInput value={form.name} onChange={(e) => setField("name", e.target.value)} />
        </OSField>
        <OSField label="Email">
          <OSInput type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
        </OSField>
        <OSField label="Company">
          <OSInput value={form.company} onChange={(e) => setField("company", e.target.value)} />
        </OSField>
        <OSField label="Segment">
          <OSSelect value={form.segment} onChange={(e) => setField("segment", e.target.value)}>
            {segments.map((s) => <option key={s} value={s}>{s}</option>)}
          </OSSelect>
        </OSField>
      </div>
      <div className="grid gap-3 sm:grid-cols-[0.5fr_1fr]">
        <OSField label="Wants">
          <OSSelect value={form.wants} onChange={(e) => setField("wants", e.target.value)}>
            <option value="call">call</option>
            <option value="deck">deck</option>
            <option value="memo">memo</option>
            <option value="deck,memo,call">deck, memo, call</option>
          </OSSelect>
        </OSField>
        <OSField label="Notes">
          <OSTextarea className="min-h-10" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        </OSField>
      </div>
      {msg ? <p className="text-sm text-neutral-400">{msg}</p> : null}
      <OSButton onClick={submit} disabled={saving || !brandId || !form.email}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Log a lead
      </OSButton>
    </div>
  );
}
