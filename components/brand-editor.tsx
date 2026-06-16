"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand } from "@/lib/types";

export function BrandEditor({ brands }: { brands: Brand[] }) {
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
      {items.map((brand) => (
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
      ))}
      {message ? <div className="xl:col-span-2 rounded-md bg-slate-100 p-3 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{message}</div> : null}
    </div>
  );
}

function updateBrand(brands: Brand[], id: string, patch: Partial<Brand>) {
  return brands.map((brand) => (brand.id === id ? { ...brand, ...patch } : brand));
}
