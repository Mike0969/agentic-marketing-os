"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { BrainCircuit, Check, Loader2, Save } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSTextarea } from "@/components/os/ui";
import { BRAND_CONTEXT_FIELDS, brandFieldState, brandGaps } from "@/lib/marketing/brand-placeholders";
import { isProposableField, type BrandProposals } from "@/lib/marketing/brand-proposals";
import type { Brand } from "@/lib/types";

const contextKeys = new Map(BRAND_CONTEXT_FIELDS.map((field) => [field.keys[0], field.keys]));



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
  { key: "approval_rules", label: "Approval rules", type: "textarea" },
  {
    key: "linkedin_organization_urn",
    label: "LinkedIn Company Page",
    type: "input",
    hint: "urn:li:organization:12345 — LinkedIn posts go out as this page (reconnect LinkedIn after setting). Empty = post as the connected member."
  },
  // Campaign templates: the non-creative parts of every campaign (no model calls). The writer and the
  // visual agent stay free; everything below is filled from here.
  { key: "tpl_success_criteria", label: "Template: success criteria", type: "textarea", hint: "Every campaign's 'how we know it worked'." },
  { key: "tpl_measure", label: "Template: what to measure", type: "textarea", hint: "One item per line (what and where)." },
  { key: "tpl_hashtags", label: "Template: hashtags", type: "input", hint: "Added to every post, e.g. #NexRide #GulfEL. Empty = taken from SEO targets." },
  { key: "tpl_posting_time", label: "Template: posting time", type: "input", hint: "HH:MM (UTC), e.g. 09:00." },
  { key: "tpl_review_checklist", label: "Template: review checklist", type: "textarea", hint: "One item per line; Crina's review checks these." },
  { key: "tpl_slide_footer", label: "Template: slide footer", type: "input", hint: "Bottom line on carousel slides. Empty = the post's CTA." }
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

export function BrandWorkspace({ brands, proposals: initialProposals = {} }: { brands: Brand[]; proposals?: BrandProposals }) {
  const [proposals, setProposals] = useState(initialProposals);
  // Fields whose proposal was used or dismissed in this edit; closed on Save.
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "dismissed">>({});
  const [items, setItems] = useState(brands);
  const [selectedId, setSelectedId] = useState(getInitialBrand(brands));
  const selected = useMemo(() => items.find((brand) => brand.id === selectedId) ?? items[0] ?? null, [items, selectedId]);
  const [draft, setDraft] = useState<Brand | null>(selected);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function chooseBrand(id: string) {
    const brand = items.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setDraft(brand);
    setDecisions({});
    setMessage(null);
  }

  function applyProposal(field: string, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setDecisions((current) => ({ ...current, [field]: "accepted" }));
  }

  function dismissProposal(field: string) {
    setDecisions((current) => ({ ...current, [field]: "dismissed" }));
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
        body: JSON.stringify({
          ...draft,
          accepted_proposals: Object.keys(decisions).filter((field) => decisions[field] === "accepted"),
          dismissed_proposals: Object.keys(decisions).filter((field) => decisions[field] === "dismissed")
        })
      });
      const payload = (await response.json()) as { brand?: Brand; error?: string };

      if (!response.ok || !payload.brand) {
        throw new Error(payload.error ?? "Brand save failed.");
      }

      setItems((current) => current.map((brand) => (brand.id === payload.brand!.id ? payload.brand! : brand)));
      setDraft(payload.brand);
      const decided = Object.keys(decisions);
      if (decided.length) {
        setProposals((current) => {
          const forBrand = { ...(current[payload.brand!.id] ?? {}) };
          for (const field of decided) if (isProposableField(field)) delete forBrand[field];
          return { ...current, [payload.brand!.id]: forBrand };
        });
      }
      setDecisions({});
      setMessage(decided.length ? `Brand profile saved. ${decided.length} proposal(s) closed.` : "Brand profile saved to the operating database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brand save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Analyze: Crina proposes improved brand fields in the background; the proposals appear as
  // "Proposed — use / dismiss" boxes. The admin can leave the page; Telegram + Slack tell him when ready.
  async function analyzeBrand() {
    if (!draft) return;
    const brandId = draft.id;
    setAnalyzing(true);
    setMessage("Crina is analysing the brand and its materials (about a minute). You can leave this page; I'll notify you when the proposals are ready.");
    try {
      const response = await fetch(`/api/marketing/brands/${brandId}/analyze`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The analysis could not start.");
      for (let i = 0; i < 180; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const res = await fetch(`/api/marketing/brands/${brandId}/analyze`);
        const body = (await res.json().catch(() => ({}))) as { status?: { state?: string; summary?: string } | null };
        if (body.status?.state === "running" && body.status.summary) setMessage(`${body.status.summary} You can leave this page; I'll notify you when the proposals are ready.`);
        if (body.status && body.status.state !== "running") {
          setMessage(body.status.summary ?? "Done.");
          if (body.status.state === "done") window.location.reload();
          return;
        }
      }
      setMessage("Still working. You'll be notified when the proposals are ready.");
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
              <div className="flex flex-wrap justify-end gap-1.5">
                {(() => {
                  const gaps = brandGaps(brand);
                  const count = gaps.placeholder.length + gaps.empty.length;
                  const proposed = Object.keys(proposals[brand.id] ?? {}).length;
                  return (
                    <>
                      {proposed ? <OSBadge tone="warn">{proposed} proposed</OSBadge> : null}
                      {count ? <OSBadge tone="warn">{count} to fill</OSBadge> : null}
                    </>
                  );
                })()}
                <OSBadge tone={brand.active ? "ok" : "off"}>{brand.active ? "Active" : "Inactive"}</OSBadge>
              </div>
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
                <OSBadge tone="info">Saved on the NexRide server</OSBadge>
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
              {analyzing ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-cyan-300" /> : <Check className="mr-2 inline h-4 w-4 text-emerald-400" />}
              {message}
            </div>
          ) : null}

          {(() => {
            const gaps = brandGaps(draft);
            if (!gaps.placeholder.length && !gaps.empty.length) return null;
            return (
              <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
                <p className="font-medium">Fill these in so the agents can write real posts. Until then the safety check blocks campaign drafts.</p>
                {gaps.placeholder.length ? <p>Placeholder text: {gaps.placeholder.join(", ")}.</p> : null}
                {gaps.empty.length ? <p>Empty: {gaps.empty.join(", ")}.</p> : null}
                {(() => {
                  const open = Object.keys(proposals[draft.id] ?? {}).filter((field) => !decisions[field]).length;
                  return open ? <p className="mt-1">{open} proposed value(s) below are waiting for your review: use, edit or dismiss each one, then Save. Agents never read a proposal until you save it into the field.</p> : null;
                })()}
              </div>
            );
          })()}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {editableFields.map((field) => {
              const keys = contextKeys.get(field.key);
              const state = keys ? brandFieldState(draft, keys) : "ok";
              return (
                <OSField key={String(field.key)} label={field.label} hint={field.hint}>
                  {field.type === "input" ? (
                    <OSInput value={asText(draft[field.key])} onChange={(event) => updateField(event, field.key)} className={state !== "ok" ? "border-amber-500/60" : undefined} />
                  ) : (
                    <OSTextarea value={asText(draft[field.key])} onChange={(event) => updateField(event, field.key)} className={state !== "ok" ? "border-amber-500/60" : undefined} />
                  )}
                  {state === "placeholder" ? <span className="mt-1 block text-xs text-amber-300">Placeholder text: replace with the real wording.</span> : null}
                  {state === "empty" ? <span className="mt-1 block text-xs text-amber-300">Empty: the agents have nothing to go on here.</span> : null}
                  {(() => {
                    const proposal = isProposableField(field.key) ? proposals[draft.id]?.[field.key] : undefined;
                    if (!proposal) return null;
                    const decision = decisions[String(field.key)];
                    if (decision === "accepted") return <span className="mt-1 block text-xs text-amber-300">Proposal copied into the field. Edit it if needed, then Save.</span>;
                    if (decision === "dismissed") return <span className="mt-1 block text-xs text-neutral-500">Proposal dismissed. Save to confirm.</span>;
                    return (
                      <span className="mt-2 block rounded-md border border-amber-500/40 bg-amber-500/10 p-3 normal-case tracking-normal">
                        <span className="block text-xs font-semibold text-amber-300">Proposed — for approval</span>
                        <span className="mt-1 block whitespace-pre-wrap text-sm leading-6 text-amber-50">{proposal.value}</span>
                        {proposal.source ? <span className="mt-1 block text-xs text-amber-300/80">Source: {proposal.source}</span> : null}
                        <span className="mt-2 flex gap-2">
                          <OSButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={(event) => { event.preventDefault(); applyProposal(String(field.key), proposal.value); }}>
                            Use this
                          </OSButton>
                          <OSButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={(event) => { event.preventDefault(); dismissProposal(String(field.key)); }}>
                            Dismiss
                          </OSButton>
                        </span>
                      </span>
                    );
                  })()}
                </OSField>
              );
            })}
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
