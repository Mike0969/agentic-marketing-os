"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel } from "@/components/os/ui";
import type { BudgetStatus, ModelPrice } from "@/lib/budget/model-budget";

const money = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

export function ModelBudgetPanel({ initial, campaignEstimateUsd, prices: initialPrices }: { initial: BudgetStatus | null; campaignEstimateUsd: number; prices: ModelPrice[] }) {
  const [budget, setBudget] = useState(initial);
  const [perDay, setPerDay] = useState(initial?.perDayUsd == null ? "" : String(initial.perDayUsd));
  const [perCampaign, setPerCampaign] = useState(initial?.perCampaignUsd == null ? "" : String(initial.perCampaignUsd));
  const [prices, setPrices] = useState(initialPrices);
  const [edit, setEdit] = useState<Record<string, { in: string; out: string; call: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy("budget");
    setMessage(null);
    const res = await fetch("/api/os/model-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perDayUsd: perDay.trim() || null, perCampaignUsd: perCampaign.trim() || null }) });
    const body = (await res.json().catch(() => ({}))) as { budget?: BudgetStatus; error?: string };
    setBusy(null);
    if (!res.ok || !body.budget) return setMessage(body.error ?? "Could not save.");
    setBudget(body.budget);
    setMessage("Saved.");
  }

  async function savePrice(p: ModelPrice) {
    const key = `${p.provider}/${p.model}`;
    const e = edit[key];
    if (!e) return;
    setBusy(key);
    const res = await fetch("/api/os/model-prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.provider, model: p.model, usdPerMIn: e.in, usdPerMOut: e.out, usdPerCall: e.call }) });
    const body = (await res.json().catch(() => ({}))) as { prices?: ModelPrice[]; error?: string };
    setBusy(null);
    if (!res.ok || !body.prices) return setMessage(body.error ?? "Could not save the price.");
    setPrices(body.prices);
    setEdit((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    setMessage(`Price saved for ${key}.`);
  }

  return (
    <OSPanel className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">Model budget</h2>
        {budget?.blockedUntil ? <OSBadge tone="danger">Hermes limit reached, resets {new Date(budget.blockedUntil).toISOString().slice(11, 16)} UTC</OSBadge> : <OSBadge tone="ok">Hermes available</OSBadge>}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">
        Every call is counted and priced by its model (Hermes runs on the subscription: $0, it only uses the shared quota). There is no limit unless you set one below; with a cap, a step that could go over it is refused before it starts, with the reason. A single-platform campaign is estimated at up to {money(campaignEstimateUsd)} with the models set in Agents.
      </p>
      {budget ? (
        <p className="mt-3 text-sm text-neutral-200" data-testid="budget-today">
          Today: <strong>{money(budget.usdToday)}</strong> spent, {budget.usedToday} calls · Daily cap: <strong>{budget.perDayUsd === null ? "No limit" : money(budget.perDayUsd)}</strong> · Per campaign: <strong>{budget.perCampaignUsd === null ? "No limit" : money(budget.perCampaignUsd)}</strong>
        </p>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Budget store not available (local mode).</p>
      )}
      <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
        <OSField label="Optional cap: $ per day" hint="Empty = no limit">
          <OSInput type="number" min={0} step="0.1" placeholder="No limit" value={perDay} onChange={(event) => setPerDay(event.target.value)} aria-label="Optional dollar cap per day" />
        </OSField>
        <OSField label="Optional cap: $ per campaign" hint="Empty = no limit">
          <OSInput type="number" min={0} step="0.05" placeholder="No limit" value={perCampaign} onChange={(event) => setPerCampaign(event.target.value)} aria-label="Optional dollar cap per campaign" />
        </OSField>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <OSButton onClick={save} disabled={busy !== null}>
          {busy === "budget" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save budget
        </OSButton>
        {message ? <span className="text-sm text-neutral-300">{message}</span> : null}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-neutral-200">Model prices</h3>
      <p className="mt-1 text-xs text-neutral-500">Dollars per 1M input / output tokens, plus a fixed price per call (Jev checks, images). Rows marked “estimate” are not verified: check your provider&apos;s price page and save the real numbers.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Provider / model</th>
              <th className="py-1 pr-2">$ / 1M in</th>
              <th className="py-1 pr-2">$ / 1M out</th>
              <th className="py-1 pr-2">$ / call</th>
              <th className="py-1 pr-2" />
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => {
              const key = `${p.provider}/${p.model}`;
              const e = edit[key] ?? { in: String(p.usd_per_m_in), out: String(p.usd_per_m_out), call: String(p.usd_per_call) };
              const set = (field: "in" | "out" | "call", value: string) => setEdit((cur) => ({ ...cur, [key]: { ...e, [field]: value } }));
              return (
                <tr key={key} className="border-t border-neutral-800">
                  <td className="py-1.5 pr-2 text-neutral-200">
                    {p.provider === "*" ? "any other" : p.provider} / {p.model === "*" ? "all models" : p.model}{" "}
                    {p.verified ? null : <OSBadge tone="warn">estimate</OSBadge>}
                    {p.note ? <div className="text-xs text-neutral-500">{p.note}</div> : null}
                  </td>
                  <td className="py-1.5 pr-2"><OSInput className="w-24" value={e.in} onChange={(ev) => set("in", ev.target.value)} aria-label={`${key} input price`} /></td>
                  <td className="py-1.5 pr-2"><OSInput className="w-24" value={e.out} onChange={(ev) => set("out", ev.target.value)} aria-label={`${key} output price`} /></td>
                  <td className="py-1.5 pr-2"><OSInput className="w-24" value={e.call} onChange={(ev) => set("call", ev.target.value)} aria-label={`${key} price per call`} /></td>
                  <td className="py-1.5 pr-2">
                    {edit[key] ? (
                      <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => void savePrice(p)} disabled={busy !== null}>
                        {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
                      </OSButton>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </OSPanel>
  );
}
