import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";
import { connectedHealth, elapsed, errorHealth, failedChat, failedTest, liveModels, missingHealth, now, parseJsonFromText, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const STATIC_MODELS = ["deepseek-chat", "deepseek-reasoner"];
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function apiKey() {
  return process.env.DEEPSEEK_API_KEY;
}

function headers() {
  return { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" };
}

export async function healthCheck() {
  if (!apiKey()) return missingHealth("DEEPSEEK_API_KEY is not configured.");
  const startedAt = now();
  try {
    await listModels();
    return connectedHealth("OK", startedAt, DEFAULT_MODEL);
  } catch (error) {
    return errorHealth(error, startedAt);
  }
}

export async function listModels() {
  if (!apiKey()) return staticModels(STATIC_MODELS);
  try {
    const response = await fetch(`${BASE_URL}/models`, { headers: headers(), signal: timeoutSignal() });
    if (!response.ok) return staticModels(STATIC_MODELS);
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).flatMap((model) => (model.id ? [{ id: model.id, label: model.id }] : []));
    return models.length ? liveModels(models) : staticModels(STATIC_MODELS);
  } catch {
    return staticModels(STATIC_MODELS);
  }
}

async function chatCompletion(model: string, prompt: string, system?: string, json = false, temperature = 0.3) {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      temperature,
      response_format: json ? { type: "json_object" } : undefined,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt }
      ]
    }),
    signal: timeoutSignal()
  });
}

export async function testCall(prompt: string, model = DEFAULT_MODEL) {
  const startedAt = now();
  if (!apiKey()) return failedTest(new Error("DEEPSEEK_API_KEY is not configured."), startedAt, model);
  try {
    const response = await chatCompletion(model, prompt);
    if (!response.ok) return failedTest(new Error(`DeepSeek returned HTTP ${response.status}.`), startedAt, model);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, model, response: data.choices?.[0]?.message?.content ?? "", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return failedTest(error, startedAt, model);
  }
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const model = options.model || DEFAULT_MODEL;
  if (!apiKey()) return failedChat(new Error("DEEPSEEK_API_KEY is not configured."), startedAt, model);
  try {
    const response = await chatCompletion(model, options.user, options.system, Boolean(options.jsonSchema), options.temperature);
    if (!response.ok) return failedChat(new Error(`DeepSeek returned HTTP ${response.status}.`), startedAt, model, response.status);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return {
      ok: true,
      json: options.jsonSchema ? parseJsonFromText(text) : null,
      text,
      status: response.status,
      error: null,
      latencyMs: elapsed(startedAt),
      model,
      usage: { promptTokens: data.usage?.prompt_tokens, completionTokens: data.usage?.completion_tokens, totalTokens: data.usage?.total_tokens }
    };
  } catch (error) {
    return failedChat(error, startedAt, model);
  }
}
