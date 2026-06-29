"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { OSButton, OSField, OSInput, OSSelect } from "@/components/os/ui";

const segments = ["investor", "operator", "developer", "utility", "other"] as const;

export function LeadCaptureForm({ brandId, token }: { brandId: string; token: string | null }) {
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    segment: "investor",
    region: "",
    power_requirement: "",
    timeline: "",
    diligence_stage: "",
    wants: "call",
    company_url: ""
  });

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/leads/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, lead_form_token: token ?? undefined, ...form })
      });
      if (!r.ok) throw new Error(r.status === 401 ? "This form is not accepting submissions right now." : "Please check your email and try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-50">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-5 w-5" />
          Request received
        </div>
        <p className="mt-2 text-sm leading-6 text-emerald-100/80">Thanks. The team has your details and will follow up from here.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        className="sr-only"
        aria-hidden="true"
        value={form.company_url}
        onChange={(e) => setField("company_url", e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <OSField label="Name">
          <OSInput value={form.name} onChange={(e) => setField("name", e.target.value)} autoComplete="name" />
        </OSField>
        <OSField label="Email">
          <OSInput required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} autoComplete="email" />
        </OSField>
        <OSField label="Company">
          <OSInput value={form.company} onChange={(e) => setField("company", e.target.value)} autoComplete="organization" />
        </OSField>
        <OSField label="Role">
          <OSInput value={form.role} onChange={(e) => setField("role", e.target.value)} autoComplete="organization-title" />
        </OSField>
        <OSField label="Segment">
          <OSSelect value={form.segment} onChange={(e) => setField("segment", e.target.value)}>
            {segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}
          </OSSelect>
        </OSField>
        <OSField label="Region">
          <OSInput value={form.region} onChange={(e) => setField("region", e.target.value)} autoComplete="address-level1" />
        </OSField>
        <OSField label="Power requirement">
          <OSInput value={form.power_requirement} onChange={(e) => setField("power_requirement", e.target.value)} placeholder="e.g. 50MW, 200MW+" />
        </OSField>
        <OSField label="Timeline">
          <OSInput value={form.timeline} onChange={(e) => setField("timeline", e.target.value)} placeholder="e.g. Q4, 6-12 months" />
        </OSField>
        <OSField label="Diligence stage">
          <OSInput value={form.diligence_stage} onChange={(e) => setField("diligence_stage", e.target.value)} placeholder="screening, IC prep, active diligence" />
        </OSField>
        <OSField label="Wants">
          <OSSelect value={form.wants} onChange={(e) => setField("wants", e.target.value)}>
            <option value="call">call</option>
            <option value="deck">deck</option>
            <option value="memo">memo</option>
            <option value="deck,memo,call">deck, memo, call</option>
          </OSSelect>
        </OSField>
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <OSButton type="submit" disabled={saving || !form.email} className="w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Submit request
      </OSButton>
    </form>
  );
}
