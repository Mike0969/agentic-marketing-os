import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";
import { connectedHealth, elapsed, errorHealth, failedChat, failedTest, liveModels, missingHealth, now, parseJsonFromText, staticModels, timeoutSignal } from "@/lib/providers/utils";

const STATIC_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-5.5"];
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function apiKey() {
  return process.env.OPENAI_API_KEY;
}

function client() {
  const key = apiKey();
  return key ? new OpenAI({ apiKey: key }) : null;
}

export async function healthCheck() {
  if (!apiKey()) return missingHealth("OPENAI_API_KEY is not configured.");
  const startedAt = now();
  try {
    await listModels();
    return connectedHealth("OK", startedAt, DEFAULT_MODEL);
  } catch (error) {
    return errorHealth(error, startedAt);
  }
}

export async function listModels() {
  const sdk = client();
  if (!sdk) return staticModels(STATIC_MODELS);
  try {
    const result = await sdk.models.list();
    const models = result.data.map((model) => ({ id: model.id, label: model.id })).sort((a, b) => a.id.localeCompare(b.id));
    return models.length ? liveModels(models) : staticModels(STATIC_MODELS);
  } catch {
    return staticModels(STATIC_MODELS);
  }
}

function messages(options: ProviderChatOptions): ChatCompletionMessageParam[] {
  return [
    ...(options.system ? [{ role: "system" as const, content: options.system }] : []),
    { role: "user" as const, content: options.user }
  ];
}

export async function testCall(prompt: string, model = DEFAULT_MODEL) {
  const startedAt = now();
  const sdk = client();
  if (!sdk) return failedTest(new Error("OPENAI_API_KEY is not configured."), startedAt, model);
  try {
    const completion = await sdk.chat.completions.create({
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: prompt }]
    });
    return { ok: true, model, response: completion.choices[0]?.message?.content ?? "", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return failedTest(error, startedAt, model);
  }
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const sdk = client();
  const model = options.model || DEFAULT_MODEL;
  if (!sdk) return failedChat(new Error("OPENAI_API_KEY is not configured."), startedAt, model);

  try {
    const completion = await sdk.chat.completions.create(
      {
        model,
        temperature: options.temperature ?? 0.3,
        response_format: options.jsonSchema ? { type: "json_object" } : undefined,
        messages: messages(options)
      },
      { signal: timeoutSignal() }
    );
    const text = completion.choices[0]?.message?.content ?? "";
    return {
      ok: true,
      json: options.jsonSchema ? parseJsonFromText(text) : null,
      text,
      status: 200,
      error: null,
      latencyMs: elapsed(startedAt),
      model,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null
      }
    };
  } catch (error) {
    return failedChat(error, startedAt, model);
  }
}
