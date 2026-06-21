import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";
import { connectedHealth, elapsed, failedChat, failedTest, missingHealth, now, parseJsonFromText, rateLimitedChat, rateLimitedTest, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const STATIC_MODELS = ["glm-5.2", "glm-4.7", "glm-4.5-flash"];
const DEFAULT_MODEL = process.env.ZHIPU_MODEL || "glm-5.2";
const RATE_LIMIT_MESSAGE = "GLM-5.2 rate limit — add credits at z.ai or retry in 60s";
const RATE_LIMIT_RETRY_MS = 10000;

function apiKey() {
  return process.env.ZHIPU_API_KEY;
}

function headers() {
  return { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" };
}

export async function healthCheck() {
  if (!apiKey()) return missingHealth("ZHIPU_API_KEY is not configured.");
  const startedAt = now();
  return connectedHealth("Configured. GLM model list is static; use Test for live confirmation.", startedAt, DEFAULT_MODEL);
}

export async function listModels() {
  return staticModels(STATIC_MODELS);
}

async function chatCompletion(model: string, prompt: string, system?: string, temperature = 0.3) {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt }
      ]
    }),
    signal: timeoutSignal()
  });
}

// On HTTP 429, wait 10s and retry once; return whatever the retry yields.
async function chatCompletionWithRetry(model: string, prompt: string, system?: string, temperature?: number) {
  const first = await chatCompletion(model, prompt, system, temperature);
  if (first.status !== 429) return first;
  await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
  return chatCompletion(model, prompt, system, temperature);
}

export async function testCall(prompt: string, model = DEFAULT_MODEL) {
  const startedAt = now();
  if (!apiKey()) return failedTest(new Error("ZHIPU_API_KEY is not configured."), startedAt, model);
  try {
    const response = await chatCompletionWithRetry(model, prompt);
    if (response.status === 429) return rateLimitedTest(RATE_LIMIT_MESSAGE, startedAt, model);
    if (!response.ok) return failedTest(new Error(`GLM returned HTTP ${response.status}.`), startedAt, model);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, model, response: data.choices?.[0]?.message?.content ?? "", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return failedTest(error, startedAt, model);
  }
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const model = options.model || DEFAULT_MODEL;
  if (!apiKey()) return failedChat(new Error("ZHIPU_API_KEY is not configured."), startedAt, model);
  try {
    const response = await chatCompletionWithRetry(model, options.user, options.system, options.temperature);
    if (response.status === 429) return rateLimitedChat(RATE_LIMIT_MESSAGE, startedAt, model);
    if (!response.ok) return failedChat(new Error(`GLM returned HTTP ${response.status}.`), startedAt, model, response.status);
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
