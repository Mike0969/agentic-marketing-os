import Anthropic from "@anthropic-ai/sdk";
import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";
import { connectedHealth, elapsed, errorHealth, failedChat, failedTest, missingHealth, now, parseJsonFromText, staticModels, timeoutSignal } from "@/lib/providers/utils";

const STATIC_MODELS = ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"];
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4";

function apiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

function client() {
  const key = apiKey();
  return key ? new Anthropic({ apiKey: key }) : null;
}

export async function healthCheck() {
  if (!apiKey()) return missingHealth("ANTHROPIC_API_KEY is not configured.");
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
    const result = await sdk.models.list({ limit: 100 });
    const models = result.data.map((model) => ({ id: model.id, label: model.id }));
    return models.length ? { source: "live" as const, models } : staticModels(STATIC_MODELS);
  } catch {
    return staticModels(STATIC_MODELS);
  }
}

function textFromMessage(message: Anthropic.Messages.Message) {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function testCall(prompt: string, model = DEFAULT_MODEL) {
  const startedAt = now();
  const sdk = client();
  if (!sdk) return failedTest(new Error("ANTHROPIC_API_KEY is not configured."), startedAt, model);
  try {
    const message = await sdk.messages.create({
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: prompt }]
    });
    return { ok: true, model, response: textFromMessage(message), latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return failedTest(error, startedAt, model);
  }
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const sdk = client();
  const model = options.model || DEFAULT_MODEL;
  if (!sdk) return failedChat(new Error("ANTHROPIC_API_KEY is not configured."), startedAt, model);

  try {
    const message = await sdk.messages.create(
      {
        model,
        max_tokens: 1200,
        temperature: options.temperature ?? 0.3,
        system: options.system,
        messages: [{ role: "user", content: options.user }]
      },
      { signal: timeoutSignal() }
    );
    const text = textFromMessage(message);
    return {
      ok: true,
      json: options.jsonSchema ? parseJsonFromText(text) : null,
      text,
      status: 200,
      error: null,
      latencyMs: elapsed(startedAt),
      model,
      usage: {
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens
      }
    };
  } catch (error) {
    return failedChat(error, startedAt, model);
  }
}
