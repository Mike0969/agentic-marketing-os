import { resolveHermesEndpoint, runHermesAgent } from "@/lib/agents/hermes-client";
import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";
import { connectedHealth, elapsed, errorHealth, failedChat, failedTest, liveModels, missingHealth, now, staticModels, timeoutSignal } from "@/lib/providers/utils";

const DEFAULT_MODEL = process.env.HERMES_AGENT_MODEL || "gpt-5.5";

function token() {
  return process.env.HERMES_AGENT_TOKEN;
}

function headers() {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (token()) result.Authorization = `Bearer ${token()}`;
  return result;
}

function baseFromEndpoint(endpoint: string) {
  return endpoint.replace(/\/v1\/chat\/completions\/?$/, "");
}

export async function healthCheck() {
  const endpoint = await resolveHermesEndpoint();
  if (!endpoint) return missingHealth("HERMES_AGENT_ENDPOINT is not configured.");
  const startedAt = now();
  try {
    const response = await fetch(`${baseFromEndpoint(endpoint)}/health`, { headers: headers(), signal: timeoutSignal(5000) });
    if (!response.ok) throw new Error(`Hermes returned HTTP ${response.status}.`);
    return connectedHealth("OK", startedAt, DEFAULT_MODEL);
  } catch (error) {
    return errorHealth(error, startedAt);
  }
}

export async function listModels() {
  const endpoint = await resolveHermesEndpoint();
  if (!endpoint) return staticModels([DEFAULT_MODEL]);
  try {
    const response = await fetch(`${baseFromEndpoint(endpoint)}/v1/models`, { headers: headers(), signal: timeoutSignal(5000) });
    if (!response.ok) return staticModels([DEFAULT_MODEL]);
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).flatMap((model) => (model.id ? [{ id: model.id, label: model.id }] : []));
    return models.length ? liveModels(models) : staticModels([DEFAULT_MODEL]);
  } catch {
    return staticModels([DEFAULT_MODEL]);
  }
}

export async function testCall(prompt: string, model = DEFAULT_MODEL) {
  const startedAt = now();
  const endpoint = await resolveHermesEndpoint();
  if (!endpoint) return failedTest(new Error("HERMES_AGENT_ENDPOINT is not configured."), startedAt, model);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 32 }),
      signal: timeoutSignal()
    });
    if (!response.ok) return failedTest(new Error(`Hermes returned HTTP ${response.status}.`), startedAt, model);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, model, response: data.choices?.[0]?.message?.content ?? "", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return failedTest(error, startedAt, model);
  }
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const model = options.model || DEFAULT_MODEL;
  const result = await runHermesAgent({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Provider Layer Hermes Chat",
    instructions: options.system,
    outputSchema: options.jsonSchema ? (options.jsonSchema as Record<string, unknown>) : { response: "string" },
    input: { prompt: options.user },
    temperature: options.temperature
  });

  if (!result.ok) return failedChat(new Error(result.error ?? "Hermes chat failed."), startedAt, model, result.status);

  return {
    ok: true,
    json: options.jsonSchema ? result.json : null,
    text: result.rawContent ?? (typeof result.json === "string" ? result.json : JSON.stringify(result.json)),
    usage: { promptTokens: result.usage.tokensPrompt, completionTokens: result.usage.tokensCompletion, totalTokens: result.usage.tokensTotal },
    status: result.status,
    error: null,
    latencyMs: elapsed(startedAt),
    model: result.modelUsed ?? model
  };
}
