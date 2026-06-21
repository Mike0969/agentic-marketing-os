"use client";

import { useState } from "react";
import { Cpu, Plus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { Badge, Panel, buttonClass, inputClass } from "@/components/ui";
import type { ModelRegistryEntry } from "@/lib/types";

/**
 * Manage the list of models that are selectable per agent on the Live Brain /
 * Agent Brain. Add a model here once; it then appears in every agent's dropdown.
 */
export function ModelsManager({ initialModels }: { initialModels: ModelRegistryEntry[] }) {
  const [models, setModels] = useState<ModelRegistryEntry[]>(initialModels);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");

  async function addModel() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const response = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, provider: provider.trim(), notes: notes.trim() })
    });
    if (response.ok) {
      const { model } = (await response.json()) as { model: ModelRegistryEntry };
      setModels((prev) => [...prev, model]);
      setName("");
      setProvider("");
      setNotes("");
    }
  }

  async function removeModel(id: string) {
    const response = await fetch(`/api/models?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setModels((prev) => prev.filter((model) => model.id !== id));
  }

  return (
    <Panel className="mb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-command" />
          <h3 className="font-semibold">Model registry</h3>
        </div>
        <Badge tone="blue">{models.length} models</Badge>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        These models populate the per-agent dropdown on the Live Brain. Add the model names Hermes exposes; the global default/backup still apply when an agent inherits.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addModel()} placeholder="Model name (e.g. gpt-5.5)" className={inputClass} />
        <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Provider (optional)" className={clsx(inputClass, "sm:w-40")} />
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" className={clsx(inputClass, "sm:w-48")} />
        <button type="button" onClick={addModel} className={clsx(buttonClass, "sm:w-auto")}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {models.length ? (
          models.map((model) => (
            <div key={model.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{model.name}</span>
                  {model.provider ? <Badge tone="neutral">{model.provider}</Badge> : null}
                </div>
                {model.notes ? <div className="truncate text-xs text-slate-500">{model.notes}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => removeModel(model.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:hover:bg-rose-950"
                aria-label="Remove model"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No models yet. Add the ones Hermes serves.</div>
        )}
      </div>
    </Panel>
  );
}
