import type { ProviderChatResult, ProviderHealth, ProviderModel, ProviderModelsResult, ProviderTestResult } from "@/lib/providers/types";

export const DEFAULT_TIMEOUT_MS = 15000;

export function now() {
  return Date.now();
}

export function elapsed(startedAt: number) {
  return Date.now() - startedAt;
}

export function timeoutSignal(ms = DEFAULT_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

export function missingHealth(detail = "API key is not configured."): ProviderHealth {
  return { status: "not_configured", configured: false, connected: false, detail };
}

export function errorHealth(error: unknown, startedAt: number): ProviderHealth {
  return {
    status: "error",
    configured: true,
    connected: false,
    detail: error instanceof Error ? error.message : "Provider health check failed.",
    latencyMs: elapsed(startedAt)
  };
}

export function connectedHealth(detail: string, startedAt: number, model?: string): ProviderHealth {
  return {
    status: "connected",
    configured: true,
    connected: true,
    detail,
    model,
    latencyMs: elapsed(startedAt)
  };
}

export function staticModels(models: string[]): ProviderModelsResult {
  return { source: "static", models: models.map((id) => ({ id, label: id })) };
}

export function liveModels(models: ProviderModel[]): ProviderModelsResult {
  return { source: "live", models };
}

export function failedTest(error: unknown, startedAt: number, model = ""): ProviderTestResult {
  return {
    ok: false,
    model,
    response: "",
    latencyMs: elapsed(startedAt),
    error: error instanceof Error ? error.message : "Provider test failed."
  };
}

export function failedChat(error: unknown, startedAt: number, model: string, status: number | null = null): ProviderChatResult {
  return {
    ok: false,
    json: null,
    text: null,
    status,
    error: error instanceof Error ? error.message : "Provider chat failed.",
    latencyMs: elapsed(startedAt),
    model
  };
}

export function parseJsonFromText(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
