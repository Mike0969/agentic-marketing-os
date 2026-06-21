"use client";

import { useState } from "react";
import { Bot, Loader2, Play } from "lucide-react";
import { OSBadge, OSButton, OSPanel } from "@/components/os/ui";
import type { AgentRunStatus } from "@/lib/types";

export type AgentCardData = {
  dbId: string;
  agentId: string;
  name: string;
  role: string;
  description: string;
  model: string;
  supabaseStatus: string;
  brandScope: string;
  registryBacked: boolean;
  lastRunAt: string | null;
  lastRunStatus: AgentRunStatus | null;
  lastRunWorkflow: string | null;
};

type RunResponse = {
  output: { statusSummary: string; nextAction: string; safetyNote: string };
  fallback: boolean;
  provider: string;
  error?: string | null;
};

function statusLabel(status: AgentRunStatus | null, running: boolean) {
  if (running) return "running";
  if (status === "fallback") return "fallback";
  if (status === "error") return "error";
  return "idle";
}

function statusTone(status: string): "ok" | "warn" | "danger" | "off" | "info" {
  if (status === "running") return "info";
  if (status === "fallback") return "warn";
  if (status === "error") return "danger";
  return "off";
}

export function AgentsWorkspace({ agents }: { agents: AgentCardData[] }) {
  const [items, setItems] = useState(agents);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastOutput, setLastOutput] = useState<{ agentId: string; response: RunResponse } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runAgent(agent: AgentCardData) {
    setRunningId(agent.agentId);
    setMessage(null);
    setLastOutput(null);

    try {
      const response = await fetch(`/api/marketing/agents/${agent.agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: agent.name, role: agent.role })
      });
      const payload = (await response.json()) as RunResponse & { error?: string };
      if (!response.ok || !payload.output) throw new Error(payload.error ?? "Agent run failed.");

      const status: AgentRunStatus = payload.fallback ? "fallback" : "success";
      setItems((current) =>
        current.map((item) =>
          item.agentId === agent.agentId
            ? { ...item, lastRunStatus: status, lastRunAt: new Date().toISOString(), lastRunWorkflow: "Marketing Agent Health Check" }
            : item
        )
      );
      setLastOutput({ agentId: agent.agentId, response: payload });
      setMessage(payload.fallback ? `${agent.name} returned FALLBACK output.` : `${agent.name} health check logged.`);
    } catch (error) {
      setItems((current) =>
        current.map((item) =>
          item.agentId === agent.agentId
            ? { ...item, lastRunStatus: "error", lastRunAt: new Date().toISOString(), lastRunWorkflow: "Marketing Agent Health Check" }
            : item
        )
      );
      setMessage(error instanceof Error ? error.message : "Agent run failed.");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((agent) => {
          const running = runningId === agent.agentId;
          const label = statusLabel(agent.lastRunStatus, running);
          const output = lastOutput?.agentId === agent.agentId ? lastOutput.response : null;

          return (
            <OSPanel key={agent.dbId}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-950">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-neutral-50">{agent.name}</h2>
                      {agent.registryBacked ? <OSBadge tone="ok">team.json</OSBadge> : <OSBadge tone="warn">DB only</OSBadge>}
                      {label === "fallback" ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                    </div>
                    <div className="mt-1 text-sm text-neutral-400">{agent.role}</div>
                  </div>
                </div>
                <OSBadge tone={statusTone(label)}>{label}</OSBadge>
              </div>

              <p className="mt-4 text-sm leading-6 text-neutral-400">{agent.description}</p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Info label="Model" value={agent.model || "Default Hermes model"} />
                <Info label="Supabase status" value={agent.supabaseStatus} />
                <Info label="Scope" value={agent.brandScope} />
              </div>

              <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">Last run</div>
                <div className="mt-1 text-sm text-neutral-300">
                  {agent.lastRunAt ? `${agent.lastRunWorkflow ?? "Agent run"} · ${new Date(agent.lastRunAt).toLocaleString()}` : "No run logged yet"}
                </div>
              </div>

              {output ? (
                <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-neutral-200">Run output</div>
                    <OSBadge tone={output.fallback ? "warn" : "ok"}>{output.fallback ? "FALLBACK" : "Hermes"}</OSBadge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">{output.output.statusSummary}</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">{output.output.nextAction}</p>
                  <p className="mt-2 text-xs leading-5 text-neutral-500">{output.output.safetyNote}</p>
                </div>
              ) : null}

              <div className="mt-4">
                <OSButton onClick={() => runAgent(agent)} disabled={running}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run
                </OSButton>
              </div>
            </OSPanel>
          );
        })}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">{label}</div>
      <div className="mt-1 line-clamp-2 text-sm text-neutral-300">{value}</div>
    </div>
  );
}
