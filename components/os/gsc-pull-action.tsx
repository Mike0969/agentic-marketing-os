"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { OSButton } from "@/components/os/ui";

// Manual, read-only Google Search Console pull -> conversion_outcomes. Idempotent; no spend, no posting.
export function GscPullAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function pull() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/analytics/search-console/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "Pull failed.");
      setMsg(`Pulled Google data — ${p.ingested ?? 0} brand(s) updated${p.skipped?.length ? `, ${p.skipped.length} skipped` : ""}.`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Pull failed.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <OSButton variant="secondary" onClick={pull} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {busy ? "Pulling..." : "Pull Google data"}
      </OSButton>
      {msg ? <span className="text-xs text-neutral-400">{msg}</span> : null}
    </div>
  );
}
