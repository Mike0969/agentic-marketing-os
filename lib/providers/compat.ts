import { fixedTemperature } from "@/lib/providers/openai";
import { withJsonHint, parseJsonFromText } from "@/lib/providers/utils";
import type { ProviderChatOptions, ProviderChatResult } from "@/lib/providers/types";

/**
 * Model providers added from Settings (no code change, no restart): one OpenAI-compatible client for
 * OpenAI, DeepSeek, OpenRouter, Google Gemini (its OpenAI-compatible endpoint) and any custom base URL,
 * plus Anthropic's own Messages API. Keys are passed in by the caller (decrypted from the DB).
 */

export const PROVIDER_KINDS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "" }
} as const;

export type ProviderKind = keyof typeof PROVIDER_KINDS;
export const isProviderKind = (v: unknown): v is ProviderKind => typeof v === "string" && v in PROVIDER_KINDS;

export type CompatTarget = { kind: ProviderKind; baseUrl: string; apiKey: string };

const NOT_CHAT = /(embed|tts|whisper|transcri|audio|realtime|moderation|image|dall-e|davinci|babbage|search|computer-use|live|speech|vision-preview|-instruct$)/i;

/** Only models an agent can chat with: drops embeddings, TTS, transcription, realtime, image models. */
export function chatModels(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.replace(/^models\//, "")).filter((id) => id && !NOT_CHAT.test(id)))).sort();
}

export function baseUrlFor(kind: ProviderKind, custom?: string | null) {
  return (kind === "custom" ? custom ?? "" : PROVIDER_KINDS[kind].baseUrl).replace(/\/+$/, "");
}

function headers(t: CompatTarget): Record<string, string> {
  if (t.kind === "anthropic") return { "x-api-key": t.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
  return { Authorization: `Bearer ${t.apiKey}`, "Content-Type": "application/json" };
}

async function readError(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const msg = typeof j.error === "string" ? j.error : j.error?.message ?? j.message;
    return `HTTP ${res.status}${msg ? `: ${String(msg).slice(0, 200)}` : ""}`;
  } catch {
    return `HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`;
  }
}

/** Does the provider accept this key? /models for most; OpenRouter's /models is public, so its /key. */
export async function checkCompatKey(t: CompatTarget, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (t.kind !== "openrouter") return;
  const res = await fetchImpl(`${t.baseUrl}/key`, { headers: headers(t), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Key rejected (${await readError(res)}).`);
}

export async function listCompatModels(t: CompatTarget, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(`${t.baseUrl}/models`, { headers: headers(t), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Models list failed (${await readError(res)}).`);
  const body = (await res.json()) as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }> };
  const ids = (body.data ?? body.models ?? []).map((m) => m.id ?? m.name ?? "").filter(Boolean);
  return chatModels(ids);
}

export async function compatChat(t: CompatTarget, model: string, options: Pick<ProviderChatOptions, "system" | "user" | "jsonSchema" | "temperature">, fetchImpl: typeof fetch = fetch): Promise<ProviderChatResult> {
  const startedAt = Date.now();
  const fail = (error: string, status: number | null = null): ProviderChatResult => ({ ok: false, json: null, text: null, status, error, latencyMs: Date.now() - startedAt, model, rateLimited: status === 429 });
  try {
    if (t.kind === "anthropic") {
      const res = await fetchImpl(`${t.baseUrl}/messages`, {
        method: "POST",
        headers: headers(t),
        body: JSON.stringify({ model, max_tokens: 4000, system: options.jsonSchema ? withJsonHint(options.system) : options.system, messages: [{ role: "user", content: options.user }], temperature: options.temperature ?? 0.3 }),
        signal: AbortSignal.timeout(300000)
      });
      if (!res.ok) return fail(await readError(res), res.status);
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      return { ok: true, json: options.jsonSchema ? parseJsonFromText(text) : null, text, status: 200, error: null, latencyMs: Date.now() - startedAt, model, usage: { promptTokens: body.usage?.input_tokens ?? null, completionTokens: body.usage?.output_tokens ?? null, totalTokens: null } };
    }
    const json = Boolean(options.jsonSchema);
    const send = (withTemperature: boolean) =>
      fetchImpl(`${t.baseUrl}/chat/completions`, {
        method: "POST",
        headers: headers(t),
        body: JSON.stringify({
          model,
          ...(withTemperature ? { temperature: options.temperature ?? 0.3 } : {}),
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            ...(options.system || json ? [{ role: "system", content: json ? withJsonHint(options.system) : options.system }] : []),
            { role: "user", content: options.user }
          ]
        }),
        signal: AbortSignal.timeout(300000)
      });
    let res = await send(!fixedTemperature(model));
    if (!res.ok && res.status === 400 && !fixedTemperature(model)) {
      const detail = await readError(res.clone());
      if (/temperature/i.test(detail)) res = await send(false);
    }
    if (!res.ok) return fail(await readError(res), res.status);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
    const text = body.choices?.[0]?.message?.content ?? "";
    return { ok: true, json: json ? parseJsonFromText(text) : null, text, status: 200, error: null, latencyMs: Date.now() - startedAt, model, usage: { promptTokens: body.usage?.prompt_tokens ?? null, completionTokens: body.usage?.completion_tokens ?? null, totalTokens: body.usage?.total_tokens ?? null } };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Provider call failed.");
  }
}
