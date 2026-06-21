export type ProviderKey = "hermes" | "anthropic" | "openai" | "deepseek" | "glm" | "ollama" | "telegram" | "slack";
export type ProviderKind = "model" | "channel";
export type ProviderStatus = "connected" | "not_configured" | "error";

export type ProviderMeta = {
  key: ProviderKey;
  label: string;
  kind: ProviderKind;
  envKeys: string[];
  defaultModel?: string;
};

export type ProviderModel = {
  id: string;
  label: string;
};

export type ProviderHealth = {
  status: ProviderStatus;
  configured: boolean;
  connected: boolean;
  detail: string;
  model?: string;
  latencyMs?: number;
};

export type ProviderModelsResult = {
  source: "live" | "static";
  models: ProviderModel[];
};

export type ProviderTestResult = {
  ok: boolean;
  model: string;
  response: string;
  latencyMs: number;
  error: string | null;
  rateLimited?: boolean;
};

export type ProviderUsage = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
};

export type ProviderChatOptions = {
  model: string;
  system?: string;
  user: string;
  jsonSchema?: object;
  temperature?: number;
};

export type ProviderChatResult = {
  ok: boolean;
  json: unknown | null;
  text: string | null;
  usage?: ProviderUsage;
  status: number | null;
  error: string | null;
  latencyMs: number;
  model: string;
  /** Soft failure: provider returned HTTP 429. Treat as "rate_limited", not a hard error. */
  rateLimited?: boolean;
};

export type ModelProviderModule = {
  healthCheck(): Promise<ProviderHealth>;
  listModels(): Promise<ProviderModelsResult>;
  testCall(prompt: string, model?: string): Promise<ProviderTestResult>;
  chat(options: ProviderChatOptions): Promise<ProviderChatResult>;
};

export type ChannelProviderModule = {
  healthCheck(): Promise<ProviderHealth>;
  listModels(): Promise<ProviderModelsResult>;
  testCall(prompt: string): Promise<ProviderTestResult>;
  send(target: string, text: string): Promise<{ ok: boolean; response: string; latencyMs: number; error: string | null }>;
};

export type ProviderModule = ModelProviderModule | ChannelProviderModule;
