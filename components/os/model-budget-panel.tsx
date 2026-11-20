"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel } from "@/components/os/ui";
import type { BudgetStatus } from "@/lib/budget/model-budget";

export function ModelBudgetPanel({ initial, campaignEstimate }: { initial: BudgetStatus | null; campaignEstimate: number }) {
  const [budget, setBudget] = useState(initial);
  const [perCampaign, setPerCampaign] = useState(String(initial?.perCampaignMax ?? 40));
  const [perDay, setPerDay] = useState(String(initial?.perDayMax ?? 150));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/os/model-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perCampaignMax: Number(perCampaign), perDayMax: Number(perDay) }) });
    const body = (await res.json().catch(() => ({}))) as { budget?: BudgetStatus; error?: string };
    setBusy(false);
    if (!res.ok || !body.budget) return setMessage(body.error ?? "Could not save.");
    setBudget(body.budget);
    setMessage("Saved.");
  }

  return (
    <OSPanel className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">Model-call budget</h2>
        {budget?.blockedUntil ? <OSBadge tone="danger">Hermes limit reached, resets {new Date(budget.blockedUntil).toISOString().slice(11, 16)} UTC</OSBadge> : <OSBadge tone="ok">Hermes available</OSBadge>}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">
        Every model call (Crina, the agents, Jev) counts. A run that could go over the budget is refused before it starts, and calls stop when the cap is reached.
        One single-platform campaign uses up to about {campaignEstimate} calls.
      </p>
      {budget ? (
        <p className="mt-3 text-sm text-neutral-200">
          Today: <strong>{budget.usedToday}</strong> used, <strong>{budget.remainingToday}</strong> of {budget.perDayMax} left (resets 00:00 UTC).
        </p>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Budget store not available (local mode).</p>
      )}
      <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
        <OSField label="Max calls per campaign">
          <OSInput type="number" min={1} value={perCampaign} onChange={(event) => setPerCampaign(event.target.value)} />
        </OSField>
        <OSField label="Max calls per day (whole app)">
          <OSInput type="number" min={1} value={perDay} onChange={(event) => setPerDay(event.target.value)} />
        </OSField>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <OSButton onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save budget
        </OSButton>
        {message ? <span className="text-sm text-neutral-300">{message}</span> : null}
      </div>
    </OSPanel>
  );
}
