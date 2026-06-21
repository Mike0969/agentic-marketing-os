import { appendLocalAgentSignal, readLocalAgentSignals, updateLocalAgentSignal } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AgentSignal, AgentSignalSeverity, AgentSignalStatus } from "@/lib/types";

/**
 * Inter-agent signals / escalations. Agents raise them; they route to Crina and
 * surface for human decision in the Live Brain. Service-role client preferred so
 * runs triggered without a session (Hermes) can still write.
 */

export type RecordSignalInput = {
  agentId: string;
  agentName: string;
  kind: string;
  severity: AgentSignalSeverity;
  message: string;
  status?: AgentSignalStatus;
  runId?: string | null;
};

export async function recordSignal(input: RecordSignalInput) {
  const row = {
    agent_id: input.agentId,
    agent_name: input.agentName,
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    status: input.status ?? "open",
    run_id: input.runId ?? null
  };

  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { error } = await supabase.from("agent_signals").insert(row);
      if (!error) return;
    }
  }

  await appendLocalAgentSignal({
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    kind: row.kind,
    severity: row.severity,
    message: row.message,
    status: row.status,
    run_id: row.run_id,
    resolved_at: null
  });
}

export async function listSignals(statuses?: AgentSignalStatus[]): Promise<AgentSignal[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      let query = supabase.from("agent_signals").select("*").order("created_at", { ascending: false }).limit(200);
      if (statuses?.length) query = query.in("status", statuses);
      const { data, error } = await query;
      if (!error && data) return data as AgentSignal[];
    }
  }

  const local = await readLocalAgentSignals();
  return statuses?.length ? local.filter((signal) => statuses.includes(signal.status)) : local;
}

export async function setSignalStatus(id: string, status: AgentSignalStatus): Promise<AgentSignal | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const patch = { status, resolved_at: status === "resolved" ? new Date().toISOString() : null };
      const { data, error } = await supabase.from("agent_signals").update(patch).eq("id", id).select("*").single();
      if (!error && data) return data as AgentSignal;
    }
  }
  return updateLocalAgentSignal(id, status);
}

/**
 * Heuristic signal emission from a finished sub-agent run. Keeps the "agents
 * look alive and raise issues" behavior without any external dependency.
 */
const TOKEN_BUDGET_THRESHOLD = 20000;

export async function emitRunSignals(params: {
  agentId: string;
  agentName: string;
  fallback: boolean;
  tokensTotal: number | null;
  output: Record<string, unknown>;
  error: string | null;
}) {
  const tasks: Promise<void>[] = [];

  if (params.fallback) {
    tasks.push(
      recordSignal({
        agentId: params.agentId,
        agentName: params.agentName,
        kind: "fallback",
        severity: "warning",
        message: params.error ? `Used deterministic fallback: ${params.error}` : "Used deterministic fallback (Hermes unavailable)."
      })
    );
  }

  if (params.tokensTotal != null && params.tokensTotal > TOKEN_BUDGET_THRESHOLD) {
    tasks.push(
      recordSignal({
        agentId: params.agentId,
        agentName: params.agentName,
        kind: "token_budget",
        severity: "warning",
        message: `High token use (${params.tokensTotal}). Consider a lighter model or tighter prompt.`
      })
    );
  }

  if (params.agentId === "agent-visual-video" && !params.fallback) {
    tasks.push(
      recordSignal({
        agentId: params.agentId,
        agentName: params.agentName,
        kind: "needs_media_budget",
        severity: "info",
        message: "Creative direction ready. Image/video generation is not enabled — needs media budget + approval to produce assets."
      })
    );
  }

  if (params.agentId === "agent-competitor-intelligence" && !params.fallback) {
    const patterns = Array.isArray((params.output as { winningPatterns?: unknown[] }).winningPatterns)
      ? ((params.output as { winningPatterns: unknown[] }).winningPatterns?.length ?? 0)
      : 0;
    if (patterns > 0) {
      tasks.push(
        recordSignal({
          agentId: params.agentId,
          agentName: params.agentName,
          kind: "hook_found",
          severity: "info",
          message: `${patterns} high-value hook pattern(s) found for Crina to route into content.`
        })
      );
    }
  }

  await Promise.all(tasks);
}
