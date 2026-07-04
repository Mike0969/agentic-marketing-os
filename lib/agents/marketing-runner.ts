import { resolveAgentRuntimeConfig } from "@/lib/agents/agent-config-store";
import { agentMemoryFileName, buildBrainContext, getHermesAgentProfile, type HermesAgentProfile } from "@/lib/agents/hermes-registry";
import { callModel } from "@/lib/providers/call-model";
import type { ProviderChatResult } from "@/lib/providers/types";

export type MarketingAgentRunOptions = {
  agentId: string;
  fallbackAgentName: string;
  fallbackRole?: string;
  task: string;
  instructions: string;
  outputSchema: Record<string, unknown>;
  input: unknown;
  brainFiles?: string[];
  temperature?: number;
  routeOrigin: string;
};

export type MarketingAgentRunResult = {
  ok: boolean;
  json: unknown | null;
  rawContent: string | null;
  status: number | null;
  provider: string;
  modelUsed: string | null;
  configSource: "agent_config" | "agent_settings" | "env";
  usage: {
    tokensPrompt: number | null;
    tokensCompletion: number | null;
    tokensTotal: number | null;
  };
  durationMs: number;
  brainResourcesUsed: string[];
  profile: HermesAgentProfile | null;
  error: string | null;
  routeOrigin: string;
  rateLimited: boolean;
  fallbackUsed: boolean;
};

const HARD_SAFETY_RULES = [
  "You never publish or post content yourself. Publishing happens only when the human operator explicitly clicks Approve & Post on a finished package.",
  "Never perform browser automation for posting.",
  "Never approve content automatically; human approval is always required.",
  "Return ONLY valid JSON matching the provided outputSchema. No markdown, no prose."
];

function buildSystemPrompt(profile: HermesAgentProfile | null, options: MarketingAgentRunOptions) {
  const agentName = profile?.name ?? options.fallbackAgentName;
  const agentId = profile?.id ?? options.agentId;
  const role = profile?.role ?? options.fallbackRole ?? "Specialist marketing agent";
  const allowed = profile?.allowed_actions ?? [];
  const blocked = profile?.blocked_actions ?? [];

  return [
    `You are ${agentName} (agentId: ${agentId}), the ${role} on the Agentic Marketing OS team for GridFactory.io and Gulf-EL.com / NexRide.`,
    profile?.purpose ? `Purpose: ${profile.purpose}` : "",
    allowed.length ? `Allowed actions: ${allowed.join("; ")}.` : "",
    blocked.length ? `Blocked actions: ${blocked.join("; ")}.` : "",
    `Route origin: ${options.routeOrigin}.`,
    `Hard safety rules: ${HARD_SAFETY_RULES.join(" ")}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(options: MarketingAgentRunOptions, brainText: string) {
  return JSON.stringify({
    task: options.task,
    instructions: options.instructions,
    outputSchema: options.outputSchema,
    sharedBrainContext: brainText || "Shared brain unavailable. Rely on the provided input only.",
    input: options.input
  });
}

function normalizeResult(
  result: ProviderChatResult,
  options: MarketingAgentRunOptions,
  provider: string,
  configSource: MarketingAgentRunResult["configSource"],
  brainResourcesUsed: string[],
  profile: HermesAgentProfile | null,
  fallbackUsed = false
): MarketingAgentRunResult {
  return {
    ok: result.ok,
    json: result.json,
    rawContent: result.text,
    status: result.status,
    provider,
    modelUsed: result.model,
    configSource,
    usage: {
      tokensPrompt: result.usage?.promptTokens ?? null,
      tokensCompletion: result.usage?.completionTokens ?? null,
      tokensTotal: result.usage?.totalTokens ?? null
    },
    durationMs: result.latencyMs,
    brainResourcesUsed,
    profile,
    error: result.error,
    routeOrigin: options.routeOrigin,
    rateLimited: result.rateLimited === true,
    fallbackUsed
  };
}

/**
 * Provider-aware marketing agent execution.
 *
 * Resolution order is agent_config -> agent_settings -> env default. Hermes is
 * still supported, but it is no longer the only path. Non-Hermes providers get
 * the same team/profile/brain context injected into their system/user prompt.
 */
export async function runMarketingAgentModel(options: MarketingAgentRunOptions): Promise<MarketingAgentRunResult> {
  const runtime = await resolveAgentRuntimeConfig(options.agentId, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
  const profile = await getHermesAgentProfile(options.agentId);
  const brainFiles = options.brainFiles ? Array.from(new Set([...options.brainFiles, agentMemoryFileName(options.agentId)])) : undefined;
  const brain = await buildBrainContext(brainFiles);
  const systemPrompt = buildSystemPrompt(profile, options);
  const userPrompt = buildUserPrompt(options, brain.text);

  const callArgs = {
    agentId: options.agentId,
    fallbackAgentName: options.fallbackAgentName,
    fallbackRole: options.fallbackRole,
    task: options.task,
    system: systemPrompt,
    user: userPrompt,
    jsonSchema: options.outputSchema,
    temperature: options.temperature,
    hermesInput: options.input,
    hermesInstructions: options.instructions,
    brainFiles: options.brainFiles
  };

  const result = await callModel({ provider: runtime.provider, model: runtime.model, ...callArgs });

  // Cross-provider resilience: if a non-hermes provider fails, retry ONCE via
  // hermes (the proven-working default). Never fabricate output; only swap the
  // failing result for a real hermes result, and mark the fallback honestly.
  if (!result.ok && runtime.provider !== "hermes") {
    const hermesModel = process.env.HERMES_AGENT_MODEL || "gpt-5.5";
    const fallback = await callModel({ provider: "hermes", model: hermesModel, ...callArgs });
    if (fallback.ok) {
      return normalizeResult(fallback, options, "hermes", runtime.source, brain.resourcesUsed, profile, true);
    }
  }

  return normalizeResult(result, options, runtime.provider, runtime.source, brain.resourcesUsed, profile);
}
