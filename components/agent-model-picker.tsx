"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { inputClass } from "@/components/ui";

/**
 * Per-agent model override. Empty value = inherit the global default. The choice
 * is persisted via /api/agent-settings and applied on the next Hermes call.
 */
export function AgentModelPicker({
  agentId,
  currentModel,
  defaultModel,
  suggestions
}: {
  agentId: string;
  currentModel: string | null;
  defaultModel: string;
  suggestions: string[];
}) {
  const [value, setValue] = useState(currentModel ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/agent-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, model: value.trim() || null })
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const listId = `models-${agentId}`;

  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Model override</div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && save()}
          list={listId}
          placeholder={`inherit default (${defaultModel})`}
          className={clsx(inputClass, "h-9 text-sm")}
        />
        <datalist id={listId}>
          {suggestions.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : "Save"}
        </button>
      </div>
    </div>
  );
}
