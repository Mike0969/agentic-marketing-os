import { getAgentRuns, getDashboardData } from "@/lib/data";
import { listSignals } from "@/lib/agents/agent-signals";
import { readHermesRegistry } from "@/lib/agents/hermes-registry";
import type { AgentRun, AgentSignal } from "@/lib/types";

/**
 * Live status snapshot powering the interactive brain. Derives each agent's
 * "alive" state from its most recent run + open signals, plus global counts.
 */

export type AgentLiveState = "idle" | "running" | "success" | "fallback" | "error" | "needs-approval";

export type AgentStatusEntry = {
  agentId: string;
  agentName: string;
  role: string;
  primary: boolean;
  defaultModel: string;
  state: AgentLiveState;
  lastRun: {
    workflow: string;
    status: AgentRun["status"];
    provider: string;
    model: string | null;
    tokensTotal: number | null;
    durationMs: number | null;
    createdAt: string;
    error: string | null;
    handoffFrom: string | null;
    handoffTo: string | null;
  } | null;
  signals: AgentSignal[];
};

export type AgentStatusSnapshot = {
  generatedAt: string;
  available: boolean;
  agents: AgentStatusEntry[];
  totals: {
    openSignals: number;
    needsApproval: number;
    pendingApprovals: number;
    runningRecently: number;
  };
};

const RUNNING_WINDOW_MS = 90_000;

function deriveState(lastRun: AgentStatusEntry["lastRun"], signals: AgentSignal[]): AgentLiveState {
  if (signals.some((signal) => signal.status === "needs_approval")) return "needs-approval";
  if (signals.some((signal) => signal.severity === "critical" && signal.status === "open")) return "error";
  if (!lastRun) return "idle";
  if (Date.now() - new Date(lastRun.createdAt).getTime() < RUNNING_WINDOW_MS && lastRun.status === "success") {
    // recent success — keep it lit as success; "running" is set optimistically client-side
  }
  if (lastRun.status === "error") return "error";
  if (lastRun.status === "fallback" || signals.some((signal) => signal.severity === "warning" && signal.status === "open")) return "fallback";
  if (lastRun.status === "success") return "success";
  return "idle";
}

export async function getAgentStatus(): Promise<AgentStatusSnapshot> {
  const [registry, runs, openSignals, data] = await Promise.all([
    readHermesRegistry(),
    getAgentRuns(undefined, 200),
    listSignals(["open", "needs_approval"]),
    getDashboardData()
  ]);

  const agents = registry.team?.agents ?? [];
  const pendingApprovals = (data.approvals ?? []).filter((approval) => approval.decision === "pending").length;

  const entries: AgentStatusEntry[] = agents.map((agent) => {
    const agentRuns = runs.filter((run) => run.agent_id === agent.id || run.agent_name === agent.name);
    const latest = agentRuns[0];
    const lastRun = latest
      ? {
          workflow: latest.workflow_name,
          status: latest.status,
          provider: latest.provider,
          model: latest.model ?? null,
          tokensTotal: latest.tokens_total ?? null,
          durationMs: latest.duration_ms ?? null,
          createdAt: latest.created_at,
          error: latest.error ?? null,
          handoffFrom: latest.handoff_from ?? null,
          handoffTo: latest.handoff_to ?? null
        }
      : null;
    const signals = openSignals.filter((signal) => signal.agent_id === agent.id || signal.agent_name === agent.name);
    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      primary: agent.primary,
      defaultModel: agent.default_model,
      state: deriveState(lastRun, signals),
      lastRun,
      signals
    };
  });

  const runningRecently = entries.filter((entry) => entry.lastRun && Date.now() - new Date(entry.lastRun.createdAt).getTime() < RUNNING_WINDOW_MS).length;

  return {
    generatedAt: new Date().toISOString(),
    available: registry.available,
    agents: entries,
    totals: {
      openSignals: openSignals.filter((signal) => signal.status === "open").length,
      needsApproval: openSignals.filter((signal) => signal.status === "needs_approval").length,
      pendingApprovals,
      runningRecently
    }
  };
}
