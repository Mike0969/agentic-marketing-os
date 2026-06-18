"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Badge, buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand, ContentItem } from "@/lib/types";

const contextFields: Array<{ key: keyof Brand; label: string; rows: string; help: string }> = [
  { key: "content_pillars", label: "Content pillars", rows: "min-h-20", help: "Recurring topics agents should build around." },
  { key: "key_messages", label: "Key messages", rows: "min-h-24", help: "Core brand claims and narrative lines to reuse." },
  { key: "proof_points", label: "Proof points / evidence needed", rows: "min-h-24", help: "Facts agents may use, plus claims that need evidence." },
  { key: "offers", label: "Offers / conversion paths", rows: "min-h-20", help: "Briefings, waitlists, partner interest, downloads, demos." },
  { key: "competitors", label: "Competitor references", rows: "min-h-20", help: "Competitors/topics the research agent should watch." },
  { key: "seo_targets", label: "SEO targets", rows: "min-h-20", help: "Keyword themes and search intent for the SEO agent." },
  { key: "approval_rules", label: "Approval rules", rows: "min-h-20", help: "Sensitive claims or topics requiring human review." },
  { key: "reusable_ctas", label: "Reusable CTAs", rows: "min-h-20", help: "Approved calls to action by campaign stage." }
];

export function BrandEditor({ brands, contentItems }: { brands: Brand[]; contentItems: ContentItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(brands);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveBrand(brand: Brand) {
    setSavingId(brand.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brand)
      });

      if (!response.ok) throw new Error("Could not save brand profile.");

      const result = (await response.json()) as { brand: Brand };
      setItems(updateBrand(items, brand.id, result.brand));
      setMessage(`${result.brand.name} saved.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save brand profile.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {items.map((brand) => {
        const brandContent = contentItems.filter((item) => item.brand_id === brand.id);
        return (
        <Panel key={brand.id}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{brand.name}</h2>
              <p className="text-sm text-slate-500">{brand.website}</p>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              {brand.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Website
              <input
                className={`${inputClass} mt-2`}
                value={brand.website}
                onChange={(event) => setItems(updateBrand(items, brand.id, { website: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium">
              Positioning
              <textarea
                className={`${inputClass} mt-2 min-h-24`}
                value={brand.positioning}
                onChange={(event) => setItems(updateBrand(items, brand.id, { positioning: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium">
              Target audience
              <textarea
                className={`${inputClass} mt-2 min-h-24`}
                value={brand.target_audience}
                onChange={(event) => setItems(updateBrand(items, brand.id, { target_audience: event.target.value }))}
              />
            </label>
            <label className="block text-sm font-medium">
              Tone of voice
              <textarea
                className={`${inputClass} mt-2 min-h-20`}
                value={brand.tone_of_voice}
                onChange={(event) => setItems(updateBrand(items, brand.id, { tone_of_voice: event.target.value }))}
              />
            </label>

            <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">Agent planning context</h3>
                <p className="mt-1 text-xs text-slate-500">These fields feed Crina, SEO, Content, Research, Visual, Publishing, and Approval judgment.</p>
              </div>
              <div className="grid gap-4">
                {contextFields.map((field) => (
                  <label key={field.key} className="block text-sm font-medium">
                    {field.label}
                    <span className="mt-1 block text-xs font-normal text-slate-500">{field.help}</span>
                    <textarea
                      className={`${inputClass} mt-2 ${field.rows}`}
                      value={String(brand[field.key] ?? "")}
                      onChange={(event) => setItems(updateBrand(items, brand.id, { [field.key]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Content linked to this brand</h3>
                  <p className="mt-1 text-xs text-slate-500">Useful context before editing the brand voice and approval rules.</p>
                </div>
                <Badge tone={brandContent.length ? "blue" : "neutral"}>{brandContent.length} items</Badge>
              </div>
              {brandContent.length ? (
                <div className="space-y-2">
                  {brandContent.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{item.title}</span>
                        <div className="flex gap-1.5">
                          <Badge tone="neutral">{item.platform}</Badge>
                          <Badge tone={item.status === "published" || item.status === "analyzed" ? "green" : item.status === "approval" ? "amber" : "neutral"}>{item.status}</Badge>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{item.assigned_agent} · {item.content_type}</div>
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">Hook: {item.hook}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No content items yet for this brand.</div>
              )}
            </div>

            <button
              type="button"
              className={buttonClass}
              onClick={() => saveBrand(brand)}
              disabled={savingId === brand.id}
            >
              <Save className="mr-2 h-4 w-4" />
              {savingId === brand.id ? "Saving..." : "Save profile"}
            </button>
          </div>
        </Panel>
        );
      })}
      {message ? <div className="xl:col-span-2 rounded-md bg-slate-100 p-3 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</div> : null}
    </div>
  );
}

function updateBrand(brands: Brand[], id: string, patch: Partial<Brand>) {
  return brands.map((brand) => (brand.id === id ? { ...brand, ...patch } : brand));
}
