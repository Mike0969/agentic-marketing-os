import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";
import { connectedHealth, elapsed, errorHealth, failedChat, failedTest, liveModels, missingHealth, now, parseJsonFromText, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.1";

export async function healthCheck() {
  if (!process.env.OLLAMA_BASE_URL) return missingHealth("OLLAMA_BASE_URL is not configured.");
  const startedAt = now();
  try {
    const response = await fetch(`${BASE_URL}/api/tags`, { signal: timeoutSignal(5000) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    return connectedHealth("OK", startedAt, DEFAULT_MODEL);
  } catch (error) {
    return errorHealth(error, startedAt);
  }
}

export async function listModels() {
  if (!process.env.OLLAMA_BASE_URL) return staticModels([]);
  try {
    const response = await fetch(`${BASE_URL}/api/tags`, { signal: timeoutSignal(5000) });
    if (!response.ok) return staticModels([]);
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).flatMap((model) => (model.name ? [{ id: model.name, label: model.name }] : []));
    return liveModels(models);
  } catch {
    return staticModels([]);
  }
}

export async function testCall(prompt: string, model = DEFAULT_MODEL) {
  const startedAt = now();
  if (!process.env.OLLAMA_BASE_URL) return failedTest(new Error("OLLAMA_BASE_URL is not configured."), startedAt, model);
  try {
    const response = await fetch(`${BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: timeoutSignal()
    });
    if (!response.ok) return failedTest(new Error(`Ollama returned HTTP ${response.status}.`), startedAt, model);
    const data = (await response.json()) as { response?: string };
    return { ok: true, model, response: data.response ?? "", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return failedTest(error, startedAt, model);
  }
}

export async function chat(options: ProviderChatOptions): Promise<ProviderChatResult> {
  const startedAt = now();
  const model = options.model || DEFAULT_MODEL;
  if (!process.env.OLLAMA_BASE_URL) return failedChat(new Error("OLLAMA_BASE_URL is not configured."), startedAt, model);
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          ...(options.system ? [{ role: "system", content: options.system }] : []),
          { role: "user", content: options.user }
        ]
      }),
      signal: timeoutSignal()
    });
    if (!response.ok) return failedChat(new Error(`Ollama returned HTTP ${response.status}.`), startedAt, model, response.status);
    const data = (await response.json()) as { message?: { content?: string } };
    const text = data.message?.content ?? "";
    return {
      ok: true,
      json: options.jsonSchema ? parseJsonFromText(text) : null,
      text,
      status: response.status,
      error: null,
      latencyMs: elapsed(startedAt),
      model
    };
  } catch (error) {
    return failedChat(error, startedAt, model);
  }
}
