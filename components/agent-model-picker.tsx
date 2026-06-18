"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { inputClass } from "@/components/ui";

/**
 * Per-agent model override sourced from the managed model registry. Empty value
 * = inherit the global/registry default. Persisted via /api/agent-settings and
 * applied on the next Hermes call.
 */
export function AgentModelPicker({
  agentId,
  currentModel,
  defaultModel,
  models
}: {
  agentId: string;
  currentModel: string | null;
  defaultModel: string;
  models: string[];
}) {
  const [value, setValue] = useState(currentModel ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Ensure the current override is selectable even if it's not in the registry.
  const options = Array.from(new Set([...(currentModel ? [currentModel] : []), ...models]));

  async function save(next: string) {
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/agent-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, model: next.trim() || null })
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Model override</div>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : saved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : null}
      </div>
      <select
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          save(event.target.value);
        }}
        className={clsx(inputClass, "mt-2 h-9 text-sm")}
      >
        <option value="">Inherit default ({defaultModel})</option>
        {options.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </div>
  );
}
