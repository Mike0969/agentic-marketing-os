"use client";

import { useMemo, useState } from "react";
import { Eye, Loader2, Play, Save } from "lucide-react";
import { OSBadge, OSButton, OSPanel, OSSelect } from "@/components/os/ui";
import type { ProviderKey, ProviderMeta } from "@/lib/providers";
import type { AgentRunStatus } from "@/lib/types";

type ColumnKey = "idle" | "queued" | "running" | "done" | "error";

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
};

export type AgentKanbanCard = {
  agentId: string;
  name: string;
  domain: "Marketing" | "Trading" | "Founder";
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
  { key: "error", label: "Error" }
];

function tone(column: ColumnKey, fallback = false): "ok" | "warn" | "danger" | "off" | "info" {
  if (fallback) return "warn";
  if (column === "running" || column === "queued") return "info";
  if (column === "done") return "ok";
  if (column === "error") return "danger";
  return "off";
}

export function AgentKanbanBoard({ initialCards, providers, modelOptions }: { initialCards: AgentKanbanCard[]; providers: ProviderMeta[]; modelOptions: ModelOption[] }) {
  const [cards, setCards] = useState(initialCards);
  const [running, setRunning] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
      const payload = (await response.json()) as { ok: boolean; status: AgentRunStatus; provider: string; model: string; outputSummary: string; durationMs: number; error?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "Agent run failed.");
      updateCard(card.agentId, {
        column: payload.status === "error" ? "error" : "done",
        provider: payload.provider,
        model: payload.model,
        lastRunAt: new Date().toISOString(),
        lastRunStatus: payload.status,
        lastRunSummary: payload.outputSummary,
        logs: [
          {
            id: `optimistic-${Date.now()}`,
            workflowName: "OS Agent Smoke Run",
            provider: payload.provider,
            model: payload.model,
            status: payload.status,
            summary: payload.outputSummary,
            createdAt: new Date().toISOString(),
            durationMs: payload.durationMs,
            error: payload.error ?? null
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

      <div className="grid gap-4 xl:grid-cols-5">
        {columns.map((column) => {
          const columnCards = cards.filter((card) => card.column === column.key);
          return (
            <OSPanel key={column.key} className="min-h-96 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-100">{column.label}</h2>
                <OSBadge tone="off">{columnCards.length}</OSBadge>
              </div>
              <div className="space-y-3">
                {columnCards.map((card) => {
                  const isRunning = running === card.agentId;
                  const isFallback = card.lastRunStatus === "fallback";
                  return (
                    <div key={card.agentId} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-neutral-100">{card.name}</h3>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <OSBadge tone={card.domain === "Marketing" ? "ok" : card.domain === "Trading" ? "warn" : "info"}>{card.domain}</OSBadge>
                            <OSBadge tone={tone(card.column, isFallback)}>{isFallback ? "FALLBACK" : card.column}</OSBadge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-neutral-500">
                        {providerLabels.get(card.provider as ProviderKey) ?? card.provider} / {card.model}
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm leading-5 text-neutral-400">{card.lastRunSummary ?? "No run logged yet."}</div>
                      <div className="mt-2 text-xs text-neutral-600">{card.lastRunAt ? new Date(card.lastRunAt).toLocaleString() : "Never run"}</div>

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
                        <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => setOpenLogs(openLogs === card.agentId ? null : card.agentId)}>
                          <Eye className="h-3.5 w-3.5" />
                          View logs
                        </OSButton>
                        {saving === card.agentId ? <OSBadge tone="info"><Save className="h-3.5 w-3.5" /> Saving</OSBadge> : null}
                      </div>

                      {openLogs === card.agentId ? (
                        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 p-2">
                          {card.logs.length ? (
                            card.logs.map((log) => (
                              <div key={log.id} className="border-b border-neutral-900 pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-neutral-300">{log.workflowName}</div>
                                  <OSBadge tone={log.status === "success" ? "ok" : log.status === "fallback" ? "warn" : "danger"}>{log.status}</OSBadge>
                                </div>
                                <div className="mt-1 text-xs text-neutral-500">
                                  {log.provider} / {log.model ?? "default"} · {new Date(log.createdAt).toLocaleString()}
                                </div>
                                <div className="mt-1 line-clamp-3 text-xs leading-5 text-neutral-400">{log.summary}</div>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-neutral-500">No logs yet.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!columnCards.length ? <div className="rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-600">No agents</div> : null}
              </div>
            </OSPanel>
          );
        })}
      </div>
    </div>
  );
}
