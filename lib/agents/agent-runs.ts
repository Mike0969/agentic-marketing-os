import { makeActivity } from "@/lib/activity";
import { appendLocalAgentRun } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AgentRunStatus } from "@/lib/types";

export type RecordAgentRunInput = {
  agentName: string;
  agentId?: string | null;
  workflowName: string;
  provider: string;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  model?: string | null;
  backupModel?: string | null;
  tokensPrompt?: number | null;
  tokensCompletion?: number | null;
  tokensTotal?: number | null;
  durationMs?: number | null;
  brainResourcesUsed?: string[] | null;
  handoffFrom?: string | null;
  handoffTo?: string | null;
  providerResponseStatus?: number | null;
};

/**
 * Persist an agent run with observability metadata. Writes to Supabase when
 * configured, otherwise the local JSON store. If the Supabase table has not yet
 * had the observability migration applied, the insert falls back to the base
 * columns so a run is still recorded (never fabricates data).
 */
export async function recordAgentRun(input: RecordAgentRunInput): Promise<string | null> {
  if (isSupabaseConfigured()) {
    // Prefer the service-role client so runs triggered without a browser session
    // (Hermes / n8n via AGENT_TRIGGER_TOKEN) are not blocked by RLS.
    const supabase = createServiceClient() ?? (await createClient());

    if (supabase) {
      const baseRow = {
        agent_name: input.agentName,
        workflow_name: input.workflowName,
        provider: input.provider,
        status: input.status,
        input: input.input,
        output: input.output,
        error: input.error
      };

      const fullRow = {
        ...baseRow,
        agent_id: input.agentId ?? null,
        model: input.model ?? null,
        backup_model: input.backupModel ?? null,
        tokens_prompt: input.tokensPrompt ?? null,
        tokens_completion: input.tokensCompletion ?? null,
        tokens_total: input.tokensTotal ?? null,
        duration_ms: input.durationMs ?? null,
        brain_resources_used: input.brainResourcesUsed ?? null,
        handoff_from: input.handoffFrom ?? null,
        handoff_to: input.handoffTo ?? null,
        provider_response_status: input.providerResponseStatus ?? null
      };

      const { data, error } = await supabase.from("agent_runs").insert(fullRow).select("id").single();

      // Observability columns may not exist yet on an older database. Retry with
      // the base columns so the run is still recorded.
      let runId = data?.id ?? null;
      if (error) {
        const retry = await supabase.from("agent_runs").insert(baseRow).select("id").single();
        runId = retry.data?.id ?? null;
      }

      if (input.status === "fallback") {
        await supabase
          .from("activity")
          .insert(makeActivity(`${input.agentName} used deterministic fallback`, input.error ?? "Hermes was unavailable, so deterministic output was used."));
      }
      return runId;
    }
  }

  await appendLocalAgentRun({
    agent_name: input.agentName,
    workflow_name: input.workflowName,
    provider: input.provider,
    status: input.status,
    input: input.input,
    output: input.output,
    error: input.error,
    agent_id: input.agentId ?? null,
    model: input.model ?? null,
    backup_model: input.backupModel ?? null,
    tokens_prompt: input.tokensPrompt ?? null,
    tokens_completion: input.tokensCompletion ?? null,
    tokens_total: input.tokensTotal ?? null,
    duration_ms: input.durationMs ?? null,
    brain_resources_used: input.brainResourcesUsed ?? null,
    handoff_from: input.handoffFrom ?? null,
    handoff_to: input.handoffTo ?? null,
    provider_response_status: input.providerResponseStatus ?? null
  });
  return null;
}
