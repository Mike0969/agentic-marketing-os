import * as anthropic from "@/lib/providers/anthropic";
import * as deepseek from "@/lib/providers/deepseek";
import * as glm from "@/lib/providers/glm";
import * as hermes from "@/lib/providers/hermes";
import * as ollama from "@/lib/providers/ollama";
import * as openai from "@/lib/providers/openai";
import * as slack from "@/lib/providers/slack";
import * as telegram from "@/lib/providers/telegram";
import type { ProviderKey, ProviderMeta, ProviderModule } from "@/lib/providers/types";

export const PROVIDERS: ProviderMeta[] = [
  { key: "hermes", label: "Hermes", kind: "model", envKeys: ["HERMES_AGENT_ENDPOINT"], defaultModel: process.env.HERMES_AGENT_MODEL || "gpt-5.5" },
  { key: "anthropic", label: "Anthropic", kind: "model", envKeys: ["ANTHROPIC_API_KEY"], defaultModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4" },
  { key: "openai", label: "OpenAI", kind: "model", envKeys: ["OPENAI_API_KEY"], defaultModel: process.env.OPENAI_MODEL || "gpt-4o-mini" },
  { key: "deepseek", label: "DeepSeek", kind: "model", envKeys: ["DEEPSEEK_API_KEY"], defaultModel: process.env.DEEPSEEK_MODEL || "deepseek-chat" },
  { key: "glm", label: "GLM / Zhipu", kind: "model", envKeys: ["ZHIPU_API_KEY"], defaultModel: process.env.ZHIPU_MODEL || "glm-4-flash" },
  { key: "ollama", label: "Ollama", kind: "model", envKeys: ["OLLAMA_BASE_URL"], defaultModel: process.env.OLLAMA_MODEL || "llama3.1" },
  { key: "telegram", label: "Telegram", kind: "channel", envKeys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
  { key: "slack", label: "Slack", kind: "channel", envKeys: ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"] }
];

const modules: Record<ProviderKey, ProviderModule> = {
  hermes,
  anthropic,
  openai,
  deepseek,
  glm,
  ollama,
  telegram,
  slack
};

export function isProviderKey(value: string): value is ProviderKey {
  return PROVIDERS.some((provider) => provider.key === value);
}

export function getProviderMeta(key: ProviderKey) {
  return PROVIDERS.find((provider) => provider.key === key)!;
}

export function isConfigured(key: ProviderKey) {
  return getProviderMeta(key).envKeys.every((envKey) => Boolean(process.env[envKey]));
}

export function getProvider(key: ProviderKey): ProviderModule {
  return modules[key];
}

export function configuredModelProviders() {
  return PROVIDERS.filter((provider) => provider.kind === "model" && isConfigured(provider.key));
}
