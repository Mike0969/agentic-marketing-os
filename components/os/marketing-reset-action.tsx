"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { OSButton, OSInput } from "@/components/os/ui";

export function MarketingResetAction() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/marketing/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Reset failed.");
      setMessage("Marketing data reset. Refreshing...");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
      <div className="text-sm font-medium text-rose-200">Reset marketing data</div>
      <p className="mt-1 text-xs leading-5 text-neutral-500">Deletes campaigns, content items, approvals, assets, and marketing agent runs. Brands and agent settings stay.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <OSInput value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type RESET MARKETING" />
        <OSButton variant="danger" onClick={reset} disabled={busy || confirm !== "RESET MARKETING"}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Reset
        </OSButton>
      </div>
      {message ? <div className="mt-2 text-xs text-neutral-400">{message}</div> : null}
    </div>
  );
}
