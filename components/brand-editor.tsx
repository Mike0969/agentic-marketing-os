"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import type { Brand } from "@/lib/types";

export function BrandEditor({ brands }: { brands: Brand[] }) {
  const [items, setItems] = useState(brands);

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
              onClick={() => alert("Mock save complete. Connect Supabase update mutation here.")}
            >
              <Save className="mr-2 h-4 w-4" />
              Save profile
            </button>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function updateBrand(brands: Brand[], id: string, patch: Partial<Brand>) {
  return brands.map((brand) => (brand.id === id ? { ...brand, ...patch } : brand));
}
