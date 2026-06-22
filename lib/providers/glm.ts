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

// ---------------------------------------------------------------------------
// Priority waterfall for GLM models
// ---------------------------------------------------------------------------
// Source order:
//   1. Direct ZAI          (ZAI_API_KEY)        — fastest, first to rate-limit
//   2. OpenRouter          (OPENROUTER_API_KEY) — paid-credits backup
//   3. HuggingFace router  (HF_API_KEY)         — free, slowest, last resort
//
// Fallback only happens on HTTP 429 / 503 (rate limit / temp unavailable).
// Any other error bubbles up from the source that raised it.

type GLMSource = "zai" | "openrouter" | "huggingface";

type GLMChatResponse = {
  text: string;
  status: number;
  source: GLMSource;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

async function callWithKey(args: {
  baseURL: string;
  apiKey: string;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  source: GLMSource;
}): Promise<GLMChatResponse> {
  const { baseURL, apiKey, model, prompt, system, temperature = 0.3, source } = args;
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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

  if (!response.ok) {
    // Attach status so the waterfall can decide whether to fall back.
    const err: Error & { status?: number } = new Error(
      `${source}: GLM returned HTTP ${response.status}`
    );
    err.status = response.status;
    throw err;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    status: response.status,
    source,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens
    }
  };
}

export async function callGLM(
  model: string,
  prompt: string,
  system?: string,
  temperature?: number
): Promise<GLMChatResponse> {
  // Source 1: Direct ZAI
  if (process.env.ZAI_API_KEY) {
    try {
      return await callWithKey({
        baseURL: process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4",
        apiKey: process.env.ZAI_API_KEY,
        model,
        prompt,
        system,
        temperature,
        source: "zai"
      });
    } catch (e: any) {
      if (e.status !== 429 && e.status !== 503) throw e; // only fallback on rate limit
      console.warn("ZAI rate limited, trying OpenRouter...");
    }
  }

  // Source 2: OpenRouter (paid credits backup)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callWithKey({
        baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        model: `z-ai/${model}`, // OpenRouter model ID format
        prompt,
        system,
        temperature,
        source: "openrouter"
      });
    } catch (e: any) {
      if (e.status !== 429 && e.status !== 503) throw e;
      console.warn("OpenRouter rate limited, trying HuggingFace...");
    }
  }

  // Source 3: HuggingFace (free, slowest)
  if (process.env.HF_API_KEY) {
    return await callWithKey({
      baseURL: process.env.HF_BASE_URL || "https://router.huggingface.co/v1",
      apiKey: process.env.HF_API_KEY,
      model: `zai-org/${model}:novita`,
      prompt,
      system,
      temperature,
      source: "huggingface"
    });
  }

  throw new Error("No GLM provider available");
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const model = options.model || DEFAULT_MODEL;
  try {
    // Prefer the priority waterfall (ZAI → OpenRouter → HuggingFace) when any
    // waterfall env key is present; otherwise fall back to the legacy Zhipu path
    // so existing ZHIPU_API_KEY configs keep working.
    const hasWaterfallKey = Boolean(
      process.env.ZAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.HF_API_KEY
    );

    if (hasWaterfallKey) {
      try {
        const result = await callGLM(model, options.user, options.system, options.temperature);
        return {
          ok: true,
          json: options.jsonSchema ? parseJsonFromText(result.text) : null,
          text: result.text,
          status: result.status,
          error: null,
          latencyMs: elapsed(startedAt),
          model,
          usage: result.usage
        };
      } catch (e: any) {
        // If the waterfall says no provider was available, fall through to the
        // legacy Zhipu path (if configured) before giving up.
        if (!apiKey()) throw e;
      }
    }

    if (!apiKey()) return failedChat(new Error("ZHIPU_API_KEY is not configured."), startedAt, model);
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
