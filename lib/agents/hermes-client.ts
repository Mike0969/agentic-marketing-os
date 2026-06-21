import { resolveAgentRuntimeConfig } from "@/lib/agents/agent-config-store";
import { agentMemoryFileName, buildBrainContext, getHermesAgentProfile, type HermesAgentProfile } from "@/lib/agents/hermes-registry";
import { listIntegrationConfigs } from "@/lib/integration-store";

/**
 * Generic OpenAI-compatible Hermes client.
 *
 * Hermes /v1/chat/completions does NOT natively route to the registered agent
 * IDs. So for every call we inject the target agent's identity, role, allowed /
 * blocked actions (from team.json) and relevant shared-brain context into the
 * system prompt, and demand strict JSON output. This is the only supported way
 * to "address" a sub-agent through the generic endpoint.
 */

export type HermesUsage = {
  tokensPrompt: number | null;
  tokensCompletion: number | null;
  tokensTotal: number | null;
};

export type HermesAgentCallOptions = {
  agentId: string;
  /** Used for display / fallback if the registry is unavailable. */
  fallbackAgentName: string;
  fallbackRole?: string;
  /** Short task / workflow label. */
  task: string;
  /** Extra natural-language instructions appended to the user message. */
  instructions?: string;
  /** Strict JSON output schema the model must follow. */
  outputSchema: Record<string, unknown>;
  /** Structured input + context payload. */
  input: unknown;
  /** Restrict which brain files are read for context (by file name). */
  brainFiles?: string[];
  handoffFrom?: string | null;
  handoffTo?: string | null;
  temperature?: number;
};

export type HermesAgentCallResult = {
  ok: boolean;
  json: unknown | null;
  rawContent: string | null;
  status: number | null;
  modelUsed: string | null;
  backupModel: string | null;
  usage: HermesUsage;
  durationMs: number;
  brainResourcesUsed: string[];
  profile: HermesAgentProfile | null;
  error: string | null;
};

const HARD_SAFETY_RULES = [
  "Never publish, schedule, or post content to any platform.",
  "Never perform browser automation for posting.",
  "Never approve content automatically; human approval is always required.",
  "Return ONLY valid JSON matching the provided outputSchema. No markdown, no prose."
];

export async function resolveHermesEndpoint(): Promise<string | null> {
  if (process.env.HERMES_AGENT_ENDPOINT) return process.env.HERMES_AGENT_ENDPOINT;

  const integrations = await listIntegrationConfigs();
  const hermes = integrations.find((integration) => integration.provider === "hermes");
  return hermes?.metadata?.endpoint || null;
}

function getHermesTimeoutMs() {
  const configured = Number(process.env.HERMES_AGENT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
}

function buildSystemPrompt(profile: HermesAgentProfile | null, options: HermesAgentCallOptions) {
  const agentName = profile?.name ?? options.fallbackAgentName;
  const agentId = profile?.id ?? options.agentId;
  const role = profile?.role ?? options.fallbackRole ?? "Specialist marketing agent";
  const allowed = profile?.allowed_actions ?? [];
  const blocked = profile?.blocked_actions ?? [];

  return [
    `You are ${agentName} (agentId: ${agentId}), the ${role} on the Agentic Marketing OS team for GridFactory.io and Gulf-EL.com / NexRide.`,
    profile?.purpose ? `Purpose: ${profile.purpose}` : "",
    "This endpoint does not natively route to your agent id; you are being addressed via a generic OpenAI-compatible call, so honor the identity and constraints described here.",
    allowed.length ? `Allowed actions: ${allowed.join("; ")}.` : "",
    blocked.length ? `Blocked actions: ${blocked.join("; ")}.` : "",
    `Hard safety rules: ${HARD_SAFETY_RULES.join(" ")}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserPrompt(options: HermesAgentCallOptions, brainText: string) {
  return JSON.stringify({
    task: options.task,
    instructions: options.instructions ?? "",
    outputSchema: options.outputSchema,
    sharedBrainContext: brainText || "Shared brain unavailable. Rely on the provided input only.",
    input: options.input
  });
}

function parseUsage(raw: unknown): HermesUsage {
  const usage = (raw as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } })?.usage;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    tokensPrompt: num(usage?.prompt_tokens),
    tokensCompletion: num(usage?.completion_tokens),
    tokensTotal: num(usage?.total_tokens)
  };
}

function extractJsonContent(raw: unknown): { json: unknown; rawContent: string } {
  const response = raw as { choices?: Array<{ message?: { content?: string } }> };
  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Hermes response did not include message content.");
  }

  try {
    return { json: JSON.parse(content), rawContent: content };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Hermes response content was not valid JSON.");
    return { json: JSON.parse(match[0]), rawContent: content };
  }
}

async function postChatCompletion(endpoint: string, model: string, systemPrompt: string, userPrompt: string, temperature: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.HERMES_AGENT_TOKEN) headers.Authorization = `Bearer ${process.env.HERMES_AGENT_TOKEN}`;

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    }),
    signal: AbortSignal.timeout(getHermesTimeoutMs())
  });
}

/**
 * Call a Hermes sub-agent. Resolves the agent profile + brain context, calls the
 * default model, and transparently retries with the backup model on failure.
 * Returns full observability metadata. Never throws — failures surface as
 * `ok: false` with an error message so callers can run a deterministic fallback.
 */
export async function runHermesAgent(options: HermesAgentCallOptions): Promise<HermesAgentCallResult> {
  const startedAt = Date.now();
  // Per-agent provider/model config takes precedence over legacy model-only
  // overrides and then the global Hermes env default.
  const runtimeConfig = await resolveAgentRuntimeConfig(options.agentId, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
  const primaryModel = runtimeConfig.model;
  const backupModel = process.env.HERMES_AGENT_BACKUP_MODEL || null;

  const base: HermesAgentCallResult = {
    ok: false,
    json: null,
    rawContent: null,
    status: null,
    modelUsed: null,
    backupModel,
    usage: { tokensPrompt: null, tokensCompletion: null, tokensTotal: null },
    durationMs: 0,
    brainResourcesUsed: [],
    profile: null,
    error: null
  };

  const profile = await getHermesAgentProfile(options.agentId);
  // Always include this agent's own memory file alongside its assigned brain
  // files. When no files are restricted, buildBrainContext reads all of them
  // (which already includes the memory file).
  const brainFiles = options.brainFiles ? Array.from(new Set([...options.brainFiles, agentMemoryFileName(options.agentId)])) : undefined;
  const brain = await buildBrainContext(brainFiles);
  const systemPrompt = buildSystemPrompt(profile, options);
  const userPrompt = buildUserPrompt(options, brain.text);
  const temperature = options.temperature ?? 0.4;

  if (runtimeConfig.provider !== "hermes") {
    const { callModel } = await import("@/lib/providers/call-model");
    const result = await callModel({
      provider: runtimeConfig.provider,
      model: primaryModel,
      agentId: options.agentId,
      fallbackAgentName: options.fallbackAgentName,
      fallbackRole: options.fallbackRole,
      task: options.task,
      system: systemPrompt,
      user: userPrompt,
      jsonSchema: options.outputSchema,
      temperature
    });

    return {
      ok: result.ok,
      json: result.json,
      rawContent: result.text,
      status: result.status,
      modelUsed: result.model,
      backupModel,
      usage: {
        tokensPrompt: result.usage?.promptTokens ?? null,
        tokensCompletion: result.usage?.completionTokens ?? null,
        tokensTotal: result.usage?.totalTokens ?? null
      },
      durationMs: result.latencyMs,
      brainResourcesUsed: brain.resourcesUsed,
      profile,
      error: result.error
    };
  }

  const endpoint = await resolveHermesEndpoint();
  if (!endpoint) {
    return { ...base, profile, brainResourcesUsed: brain.resourcesUsed, durationMs: Date.now() - startedAt, error: "HERMES_AGENT_ENDPOINT is not configured." };
  }

  // Only the OpenAI-compatible chat completions path is supported for sub-agents.
  if (!endpoint.includes("/v1/chat/completions")) {
    return {
      ...base,
      profile,
      brainResourcesUsed: brain.resourcesUsed,
      durationMs: Date.now() - startedAt,
      error: "Hermes endpoint is not an OpenAI-compatible chat completions URL."
    };
  }

  const models = backupModel && backupModel !== primaryModel ? [primaryModel, backupModel] : [primaryModel];
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (const model of models) {
    try {
      const response = await postChatCompletion(endpoint, model, systemPrompt, userPrompt, temperature);
      lastStatus = response.status;

      if (!response.ok) {
        lastError = `Hermes returned HTTP ${response.status} for model ${model}.`;
        continue;
      }

      const raw = (await response.json()) as unknown;
      const { json, rawContent } = extractJsonContent(raw);

      return {
        ok: true,
        json,
        rawContent,
        status: response.status,
        modelUsed: model,
        backupModel,
        usage: parseUsage(raw),
        durationMs: Date.now() - startedAt,
        brainResourcesUsed: brain.resourcesUsed,
        profile,
        error: null
      };
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : "Hermes call failed.";
    }
  }

  return {
    ...base,
    profile,
    brainResourcesUsed: brain.resourcesUsed,
    status: lastStatus,
    durationMs: Date.now() - startedAt,
    error: lastError ?? "Hermes call failed."
  };
}
