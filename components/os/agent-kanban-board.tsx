"use client";

import { useMemo, useState } from "react";
import { Eye, Loader2, Play, Save, X } from "lucide-react";
import { OSBadge, OSButton, OSPanel, OSSelect } from "@/components/os/ui";
import type { ProviderKey, ProviderMeta } from "@/lib/providers";
import type { AgentRunStatus } from "@/lib/types";

type ColumnKey = "idle" | "queued" | "running" | "done" | "needs_key" | "blocked" | "error";

export type AgentKanbanRun = {
  id: string;
  workflowName: string;
  provider: string;
  model: string | null;
  status: AgentRunStatus;
  summary: string;
  createdAt: string;
  durationMs: number | null;
  error: string | null;
  output: Record<string, unknown> | null;
};

export type AgentKanbanCard = {
  agentId: string;
  name: string;
  domain: "Marketing";
  provider: string;
  model: string;
  column: ColumnKey;
  lastRunAt: string | null;
  lastRunStatus: AgentRunStatus | null;
  lastRunSummary: string | null;
  logs: AgentKanbanRun[];
};

type ModelOption = {
  provider: ProviderKey;
  providerLabel: string;
  model: string;
  label: string;
};

const columns: Array<{ key: ColumnKey; label: string }> = [
  { key: "idle", label: "Idle" },
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "done", label: "Done" },
  { key: "needs_key", label: "Needs key" },
  { key: "blocked", label: "Blocked" },
  { key: "error", label: "Error" }
];

function tone(column: ColumnKey, fallback = false): "ok" | "warn" | "danger" | "off" | "info" {
  if (fallback) return "warn";
  if (column === "running" || column === "queued") return "info";
  if (column === "done") return "ok";
  if (column === "needs_key" || column === "blocked") return "warn";
  if (column === "error") return "danger";
  return "off";
}

function label(key: string) {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function OutputValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-neutral-600">-</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, index) => (
          <li key={index}>
            <OutputValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="space-y-1">
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div key={key}>
          <dt className="text-xs font-medium text-neutral-500">{label(key)}</dt>
          <dd>
            <OutputValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RunOutput({ run }: { run: AgentKanbanRun }) {
  const entries = Object.entries(run.output ?? {}).filter(([key]) => key !== "summary");
  return (
    <div className="space-y-3 text-sm leading-6 text-neutral-300">
      <p className="text-neutral-200">{run.summary}</p>
      {run.error ? <p className="text-red-300">{run.error}</p> : null}
      {entries.map(([key, value]) => (
        <div key={key}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label(key)}</h4>
          <div className="mt-1">
            <OutputValue value={value} />
          </div>
        </div>
      ))}
    </div>
  );
}

function statusTone(status: AgentRunStatus): "ok" | "warn" | "danger" {
  if (status === "success") return "ok";
  if (status === "fallback" || status === "rate_limited" || status === "needs_key" || status === "blocked") return "warn";
  return "danger";
}

function statusText(status: AgentRunStatus) {
  if (status === "rate_limited") return "rate limited";
  if (status === "needs_key") return "needs key";
  return status;
}

export function AgentKanbanBoard({ initialCards, providers, modelOptions }: { initialCards: AgentKanbanCard[]; providers: ProviderMeta[]; modelOptions: ModelOption[] }) {
  const [cards, setCards] = useState(initialCards);
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const logCard = cards.find((card) => card.agentId === openLogs) ?? null;
  const providerLabels = useMemo(() => new Map(providers.map((provider) => [provider.key, provider.label])), [providers]);

  function updateCard(agentId: string, patch: Partial<AgentKanbanCard>) {
    setCards((current) => current.map((card) => (card.agentId === agentId ? { ...card, ...patch } : card)));
  }

  async function runAgent(card: AgentKanbanCard) {
    setRunning(card.agentId);
    setMessage(null);
    updateCard(card.agentId, { column: "queued" });

    window.setTimeout(() => {
      setCards((current) => current.map((item) => (item.agentId === card.agentId ? { ...item, column: "running" } : item)));
    }, 100);

    try {
      const response = await fetch(`/api/os/agents/${card.agentId}/run`, { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; status: AgentRunStatus; provider: string; model: string; workflowName?: string; outputSummary: string; output?: Record<string, unknown> | null; durationMs: number; error?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "Agent run failed.");
      updateCard(card.agentId, {
        column: payload.status === "error" ? "error" : payload.status === "needs_key" ? "needs_key" : payload.status === "blocked" ? "blocked" : "done",
        provider: payload.provider,
        model: payload.model,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: payload.status,
        lastRunSummary: payload.outputSummary,
        logs: [
          {
            id: `optimistic-${Date.now()}`,
            workflowName: payload.workflowName ?? "Agent run",
            provider: payload.provider,
            model: payload.model,
            status: payload.status,
            summary: payload.outputSummary,
            createdAt: new Date().toISOString(),
            durationMs: payload.durationMs,
            error: payload.error ?? null,
            output: payload.output ?? null
          },
          ...card.logs
        ]
      });
      setMessage(`${card.name} run logged with ${payload.provider}/${payload.model}.`);
    } catch (error) {
      updateCard(card.agentId, {
        column: "error",
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "error",
        lastRunSummary: error instanceof Error ? error.message : "Agent run failed."
      });
      setMessage(error instanceof Error ? error.message : "Agent run failed.");
    } finally {
      setRunning(null);
    }
  }

  async function switchModel(agentId: string, value: string) {
    const [provider, ...modelParts] = value.split("::");
    const model = modelParts.join("::");
    setSaving(agentId);
    setMessage(null);

    try {
      const response = await fetch(`/api/os/agents/${agentId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model })
      });
      const payload = (await response.json()) as { provider?: string; model?: string; error?: string };
      if (!response.ok || !payload.provider || !payload.model) throw new Error(payload.error ?? "Model switch failed.");
      updateCard(agentId, { provider: payload.provider, model: payload.model });
      setMessage(`Model switch saved: ${providerLabels.get(payload.provider as ProviderKey) ?? payload.provider} / ${payload.model}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Model switch failed.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        {columns.map((column) => {
          const count = cards.filter((card) => card.column === column.key).length;
          return (
            <span key={column.key} className={count ? "text-neutral-300" : undefined}>
              <OSBadge tone={count ? tone(column.key) : "off"}>
                {column.label} {count}
              </OSBadge>
            </span>
          );
        })}
        <span className="ml-1">Empty columns are hidden.</span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {columns.map((column) => {
          const columnCards = cards.filter((card) => card.column === column.key);
          if (!columnCards.length) return null;
          return (
            <OSPanel key={column.key} className="min-w-[300px] flex-1 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-100">{column.label}</h2>
                <OSBadge tone="off">{columnCards.length}</OSBadge>
              </div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                {columnCards.map((card) => {
                  const isRunning = running === card.agentId;
                  const isFallback = card.lastRunStatus === "fallback";
                  const isRateLimited = card.lastRunStatus === "rate_limited";
                  return (
                    <div key={card.agentId} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-neutral-100">{card.name}</h3>
                        <OSBadge tone={isRateLimited ? "warn" : tone(card.column, isFallback)}>{isRateLimited ? "RATE LIMITED" : isFallback ? "FALLBACK" : card.column === "needs_key" ? "NEEDS KEY" : card.column === "blocked" ? "BLOCKED" : card.column}</OSBadge>
                      </div>

                      <div className="mt-2 text-xs text-neutral-500">
                        {providerLabels.get(card.provider as ProviderKey) ?? card.provider} / {card.model} · {card.lastRunAt ? new Date(card.lastRunAt).toLocaleString() : "Never run"}
                      </div>
                      <div className="mt-2 line-clamp-3 text-sm leading-5 text-neutral-400">{card.lastRunSummary ?? "No run logged yet."}</div>

                      <div className="mt-3">
                        <OSSelect value={`${card.provider}::${card.model}`} onChange={(event) => switchModel(card.agentId, event.target.value)} disabled={saving === card.agentId}>
                          <option value={`${card.provider}::${card.model}`}>{card.provider} / {card.model}</option>
                          {modelOptions.map((option) => (
                            <option key={`${option.provider}:${option.model}`} value={`${option.provider}::${option.model}`}>
                              {option.providerLabel} / {option.label}
                            </option>
                          ))}
                        </OSSelect>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <OSButton className="px-2 py-1 text-xs" onClick={() => runAgent(card)} disabled={isRunning}>
                          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          Run
                        </OSButton>
                        <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => setOpenLogs(card.agentId)}>
                          <Eye className="h-3.5 w-3.5" />
                          View logs
                        </OSButton>
                        {saving === card.agentId ? <OSBadge tone="info"><Save className="h-3.5 w-3.5" /> Saving</OSBadge> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </OSPanel>
          );
        })}
      </div>

      {logCard ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setOpenLogs(null)}>
          <aside
            role="dialog"
            aria-label={`${logCard.name} logs`}
            className="flex h-full w-full max-w-3xl flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-50">{logCard.name}</h2>
                <p className="text-xs text-neutral-500">Last {logCard.logs.length} runs, newest first</p>
              </div>
              <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => setOpenLogs(null)} aria-label="Close logs">
                <X className="h-4 w-4" />
                Close
              </OSButton>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {logCard.logs.length ? (
                logCard.logs.map((log, index) => (
                  <details key={log.id} open={index === 0} className="rounded-md border border-neutral-800 bg-neutral-900/60 p-4">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-100">{log.workflowName}</span>
                      <OSBadge tone={statusTone(log.status)}>{statusText(log.status)}</OSBadge>
                      <span className="text-xs text-neutral-500">
                        {log.provider} / {log.model ?? "default"} · {new Date(log.createdAt).toLocaleString()}
                        {log.durationMs ? ` · ${(log.durationMs / 1000).toFixed(1)}s` : ""}
                      </span>
                    </summary>
                    <div className="mt-3">
                      <RunOutput run={log} />
                    </div>
                  </details>
                ))
              ) : (
                <p className="text-sm text-neutral-500">No logs yet.</p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
