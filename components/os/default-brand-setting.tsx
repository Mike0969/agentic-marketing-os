"use client";

import { useState } from "react";
import { OSBadge, OSPanel, OSSelect } from "@/components/os/ui";

/** Settings → Default brand: the brand every page starts on when the header switcher hasn't picked one. */
export function DefaultBrandSetting({ brands, defaultId }: { brands: Array<{ id: string; name: string }>; defaultId: string | null }) {
  const [value, setValue] = useState(defaultId ?? "");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(id: string) {
    setValue(id);
    const res = await fetch("/api/os/brand-selection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: id, makeDefault: true }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setStatus({ ok: false, text: body.error ?? "Could not save." });
    window.location.reload();
  }
  return (
    <OSPanel className="mb-6 flex flex-wrap items-center gap-3">
      <h2 className="text-lg font-semibold text-neutral-50">Default brand</h2>
      <OSSelect value={value} onChange={(e) => void save(e.target.value)} aria-label="Default brand" className="w-72">
        {!value ? <option value="">Choose…</option> : null}
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </OSSelect>
      <span className="text-sm text-neutral-400">Every page starts on this brand. The Brand menu at the top switches it for all pages until you change it again.</span>
      {status ? <OSBadge tone={status.ok ? "ok" : "danger"}>{status.text}</OSBadge> : null}
    </OSPanel>
  );
}
