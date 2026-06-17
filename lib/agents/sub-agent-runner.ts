import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runHermesAgent } from "@/lib/agents/hermes-client";

/**
 * Shared scaffold for the specialist sub-agents. Each route supplies an
 * agent-specific prompt context + strict JSON schema and a deterministic
 * fallback. None of these agents may publish — that is enforced by the hard
 * safety rules in the Hermes client and by the deterministic fallbacks here.
 */

export type SubAgentConfig = {
  agentId: string;
  agentName: string;
  role: string;
  task: string;
  instructions: string;
  outputSchema: Record<string, unknown>;
  brainFiles?: string[];
  handoffFrom?: string | null;
  handoffTo?: string | null;
  /** Deterministic, offline result used when Hermes is unavailable. */
  deterministicOutput: (input: unknown) => Record<string, unknown>;
};

export type SubAgentRunResult = {
  agent: string;
  agentId: string;
  provider: "hermes" | "deterministic";
  fallback: boolean;
  output: Record<string, unknown>;
  error: string | null;
  observability: {
    model: string | null;
    backupModel: string | null;
    durationMs: number;
    tokensTotal: number | null;
    providerResponseStatus: number | null;
    brainResourcesUsed: string[];
    handoffFrom: string | null;
    handoffTo: string | null;
  };
};

export async function runSubAgent(config: SubAgentConfig, input: unknown): Promise<SubAgentRunResult> {
  const result = await runHermesAgent({
    agentId: config.agentId,
    fallbackAgentName: config.agentName,
    fallbackRole: config.role,
    task: config.task,
    instructions: config.instructions,
    outputSchema: config.outputSchema,
    input,
    brainFiles: config.brainFiles,
    handoffFrom: config.handoffFrom ?? null,
    handoffTo: config.handoffTo ?? null
  });

  const observability = {
    model: result.modelUsed,
    backupModel: result.backupModel,
    durationMs: result.durationMs,
    tokensTotal: result.usage.tokensTotal,
    providerResponseStatus: result.status,
    brainResourcesUsed: result.brainResourcesUsed,
    handoffFrom: config.handoffFrom ?? null,
    handoffTo: config.handoffTo ?? null
  };

  if (result.ok && result.json && typeof result.json === "object") {
    const output = result.json as Record<string, unknown>;

    await recordAgentRun({
      agentName: config.agentName,
      agentId: config.agentId,
      workflowName: config.task,
      provider: "hermes",
      status: "success",
      input: input as Record<string, unknown>,
      output,
      error: null,
      model: result.modelUsed,
      backupModel: result.backupModel,
      tokensPrompt: result.usage.tokensPrompt,
      tokensCompletion: result.usage.tokensCompletion,
      tokensTotal: result.usage.tokensTotal,
      durationMs: result.durationMs,
      brainResourcesUsed: result.brainResourcesUsed,
      handoffFrom: config.handoffFrom ?? null,
      handoffTo: config.handoffTo ?? null,
      providerResponseStatus: result.status
    });

    return { agent: config.agentName, agentId: config.agentId, provider: "hermes", fallback: false, output, error: null, observability };
  }

  const output = config.deterministicOutput(input);
  await recordAgentRun({
    agentName: config.agentName,
    agentId: config.agentId,
    workflowName: config.task,
    provider: "deterministic",
    status: "fallback",
    input: input as Record<string, unknown>,
    output,
    error: result.error,
    model: process.env.HERMES_AGENT_MODEL || "gpt-5.5",
    backupModel: result.backupModel,
    durationMs: result.durationMs,
    brainResourcesUsed: result.brainResourcesUsed,
    handoffFrom: config.handoffFrom ?? null,
    handoffTo: config.handoffTo ?? null,
    providerResponseStatus: result.status
  });

  return { agent: config.agentName, agentId: config.agentId, provider: "deterministic", fallback: true, output, error: result.error, observability };
}
