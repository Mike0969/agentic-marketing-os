"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { OSButton, OSSelect } from "@/components/os/ui";
import type { Brand } from "@/lib/types";

export function ConversionAnalyzeAction({ brands }: { brands: Brand[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/sales/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId })
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "Analysis failed.");
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Analysis failed.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <OSSelect value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-44">
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </OSSelect>
      <OSButton onClick={analyze} disabled={busy || !brandId} className="shrink-0">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Analyzing..." : "Analyze conversion"}
      </OSButton>
      {msg ? <span className="text-xs text-rose-300">{msg}</span> : null}
    </div>
  );
}
