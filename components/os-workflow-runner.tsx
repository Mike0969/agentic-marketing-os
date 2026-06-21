"use client";

import { useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Badge, buttonClass, inputClass } from "@/components/ui";
import type { OsWorkflowKey, OsWorkflowResult } from "@/lib/os-workflows";

export function OsWorkflowRunner({
  workflow,
  buttonLabel,
  defaultInput,
  notePlaceholder = "Optional context for Hermes..."
}: {
  workflow: OsWorkflowKey;
  buttonLabel: string;
  defaultInput?: Record<string, unknown>;
  notePlaceholder?: string;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OsWorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/os/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow, input: { ...(defaultInput ?? {}), notes } })
      });
      const payload = (await response.json().catch(() => ({}))) as OsWorkflowResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `Workflow failed with HTTP ${response.status}`);
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workflow failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel dark:border-slate-800 dark:bg-slate-900">
      <label className="block text-sm font-medium">
        Operator notes
        <textarea className={`${inputClass} mt-2 min-h-24`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={notePlaceholder} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={run} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          {loading ? "Running Hermes..." : buttonLabel}
        </button>
        <Badge tone="amber">COMING SOON live integrations</Badge>
      </div>

      {error ? <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}

      {result ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{result.title}</div>
              <div className="text-xs text-slate-500">{result.safety}</div>
            </div>
            <Badge tone={result.fallback ? "amber" : "green"}>{result.provider}</Badge>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs leading-5 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">
            {JSON.stringify(result.output, null, 2)}
          </pre>
          {result.error ? <div className="mt-3 text-xs text-amber-700 dark:text-amber-300">Fallback reason: {result.error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
