"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { BrainCircuit, Check, Loader2, Save } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSTextarea } from "@/components/os/ui";
import type { Brand } from "@/lib/types";

type BrandAnalysis = {
  positioningDiagnosis: string;
  audienceGaps: string[];
  contentPillarRecommendations: string[];
  seoOpportunities: string[];
  ctaRecommendations: string[];
  approvalRisks: string[];
  nextActions: string[];
};

type AnalysisResponse = {
  provider: "hermes" | "deterministic";
  fallback: boolean;
  output: BrandAnalysis;
  error?: string | null;
};

const editableFields: Array<{ key: keyof Brand; label: string; type: "input" | "textarea"; hint?: string }> = [
  { key: "name", label: "Brand name", type: "input" },
  { key: "website", label: "Website", type: "input" },
  { key: "positioning", label: "Positioning", type: "textarea" },
  { key: "target_audience", label: "Target audience", type: "textarea" },
  { key: "tone_of_voice", label: "Tone of voice", type: "textarea" },
  { key: "pillars", label: "Pillars", type: "textarea", hint: "Separate pillars with commas or semicolons." },
  { key: "seo_targets", label: "SEO targets", type: "textarea", hint: "Primary keyword clusters and search topics." },
  { key: "ctas", label: "CTAs", type: "textarea", hint: "Approved conversion asks for the agents." },
  { key: "key_messages", label: "Key messages", type: "textarea" },
  { key: "proof_points", label: "Proof points", type: "textarea" },
  { key: "offers", label: "Offers", type: "textarea" },
  { key: "competitors", label: "Competitors", type: "textarea" },
  { key: "approval_rules", label: "Approval rules", type: "textarea" }
];

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function splitList(value?: string | null) {
  return (value ?? "")
    .split(/[;\n]/)
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function firstLine(value?: string | null) {
  return (value ?? "").split(/\n|;/)[0]?.trim() || "Not set";
}

function brandPillars(brand: Brand) {
  return brand.pillars ?? brand.content_pillars ?? "";
}

function brandCtas(brand: Brand) {
  return brand.ctas ?? brand.reusable_ctas ?? "";
}

function getInitialBrand(brands: Brand[]) {
  return brands[0]?.id ?? "";
}

export function BrandWorkspace({ brands }: { brands: Brand[] }) {
  const [items, setItems] = useState(brands);
  const [selectedId, setSelectedId] = useState(getInitialBrand(brands));
  const selected = useMemo(() => items.find((brand) => brand.id === selectedId) ?? items[0] ?? null, [items, selectedId]);
  const [draft, setDraft] = useState<Brand | null>(selected);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  function chooseBrand(id: string) {
    const brand = items.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setDraft(brand);
    setMessage(null);
    setAnalysis(null);
  }

  function updateField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, key: keyof Brand) {
    const value = event.target.value;
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveBrand() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/brands/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const payload = (await response.json()) as { brand?: Brand; error?: string };

      if (!response.ok || !payload.brand) {
        throw new Error(payload.error ?? "Brand save failed.");
      }

      setItems((current) => current.map((brand) => (brand.id === payload.brand!.id ? payload.brand! : brand)));
      setDraft(payload.brand);
      setMessage("Brand profile saved to the operating database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brand save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function analyzeBrand() {
    if (!draft) return;
    setAnalyzing(true);
    setAnalysis(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/marketing/brands/${draft.id}/analyze`, { method: "POST" });
      const payload = (await response.json()) as AnalysisResponse & { error?: string };

      if (!response.ok || !payload.output) {
        throw new Error(payload.error ?? "Brand analysis failed.");
      }

      setAnalysis(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brand analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (!items.length || !draft) {
    return (
      <OSPanel>
        <OSBadge tone="demo">DEMO</OSBadge>
        <p className="mt-3 text-sm text-neutral-400">No brands are available. Seed Supabase or run the local fallback seed to start.</p>
      </OSPanel>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.4fr]">
      <div className="space-y-4">
        {items.map((brand) => (
          <button
            key={brand.id}
            type="button"
            onClick={() => chooseBrand(brand.id)}
            className={`w-full rounded-lg border p-5 text-left transition ${
              brand.id === selectedId ? "border-neutral-500 bg-neutral-900" : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-neutral-50">{brand.name}</div>
                <div className="mt-1 text-sm text-neutral-500">{brand.website}</div>
              </div>
              <OSBadge tone={brand.active ? "ok" : "off"}>{brand.active ? "Active" : "Inactive"}</OSBadge>
            </div>
            <p className="mt-4 text-sm leading-6 text-neutral-300">{brand.positioning}</p>
            <div className="mt-4 grid gap-3">
              <SummaryRow label="Pillars" value={firstLine(brandPillars(brand))} />
              <SummaryRow label="SEO" value={firstLine(brand.seo_targets)} />
              <SummaryRow label="CTA" value={firstLine(brandCtas(brand))} />
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-5">
        <OSPanel>
          <div className="flex flex-col justify-between gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-neutral-50">{draft.name}</h2>
                <OSBadge tone="info">Supabase-backed</OSBadge>
              </div>
              <p className="mt-2 text-sm text-neutral-400">Edit the context Crina and the specialist agents use for plans, drafts, SEO, approvals, and CTAs.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <OSButton variant="secondary" onClick={analyzeBrand} disabled={analyzing}>
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                Analyze
              </OSButton>
              <OSButton onClick={saveBrand} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </OSButton>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
              <Check className="mr-2 inline h-4 w-4 text-emerald-400" />
              {message}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {editableFields.map((field) => (
              <OSField key={String(field.key)} label={field.label} hint={field.hint}>
                {field.type === "input" ? (
                  <OSInput value={asText(draft[field.key])} onChange={(event) => updateField(event, field.key)} />
                ) : (
                  <OSTextarea value={asText(draft[field.key])} onChange={(event) => updateField(event, field.key)} />
                )}
              </OSField>
            ))}
          </div>
        </OSPanel>

        <OSPanel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-neutral-100">Agent-readable strategy context</h3>
              <p className="mt-1 text-sm text-neutral-500">The visible operating memory for this brand. Empty fields reduce output quality.</p>
            </div>
            <OSBadge tone="off">Read preview</OSBadge>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <ListBlock label="Pillars" items={splitList(brandPillars(draft))} />
            <ListBlock label="SEO targets" items={splitList(draft.seo_targets)} />
            <ListBlock label="CTAs" items={splitList(brandCtas(draft))} />
          </div>
        </OSPanel>

        {analysis ? (
          <OSPanel>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-neutral-100">Crina brand analysis</h3>
              <div className="flex gap-2">
                <OSBadge tone={analysis.fallback ? "warn" : "ok"}>{analysis.fallback ? "FALLBACK" : "Hermes"}</OSBadge>
                {analysis.error ? <OSBadge tone="danger">Error logged</OSBadge> : null}
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-neutral-300">{analysis.output.positioningDiagnosis}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ListBlock label="Audience gaps" items={analysis.output.audienceGaps} />
              <ListBlock label="Pillar recommendations" items={analysis.output.contentPillarRecommendations} />
              <ListBlock label="SEO opportunities" items={analysis.output.seoOpportunities} />
              <ListBlock label="CTA recommendations" items={analysis.output.ctaRecommendations} />
              <ListBlock label="Approval risks" items={analysis.output.approvalRisks} />
              <ListBlock label="Next actions" items={analysis.output.nextActions} />
            </div>
          </OSPanel>
        ) : null}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm text-neutral-300">{value}</div>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      {items.length ? (
        <ul className="mt-2 space-y-1.5 text-sm leading-5 text-neutral-300">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 text-sm text-neutral-600">Not set</div>
      )}
    </div>
  );
}
