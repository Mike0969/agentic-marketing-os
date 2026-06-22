import { runHermesAgent, type HermesAgentCallOptions } from "@/lib/agents/hermes-client";
import { getProvider, isProviderKey } from "@/lib/providers/registry";
import type { ModelProviderModule, ProviderChatOptions, ProviderChatResult, ProviderKey } from "@/lib/providers/types";
import { failedChat, now } from "@/lib/providers/utils";

export type CallModelOptions = ProviderChatOptions & {
  provider: string;
  agentId: string;
  fallbackAgentName: string;
  fallbackRole?: string;
  task: string;
  hermesInput?: HermesAgentCallOptions["input"];
  hermesInstructions?: string;
  brainFiles?: string[];
};

function isModelProvider(module: unknown): module is ModelProviderModule {
  return Boolean(module && typeof module === "object" && "chat" in module);
}

export async function callModel(options: CallModelOptions): Promise<ProviderChatResult> {
  const provider = options.provider as ProviderKey;
  const model = options.model;

  if (!isProviderKey(provider)) {
    return failedChat(new Error(`Unknown provider: ${options.provider}`), now(), model);
  }

  if (provider === "hermes") {
    const result = await runHermesAgent({
      agentId: options.agentId,
      fallbackAgentName: options.fallbackAgentName,
      fallbackRole: options.fallbackRole,
      task: options.task,
      instructions: options.hermesInstructions ?? options.system,
      outputSchema: options.jsonSchema ? (options.jsonSchema as Record<string, unknown>) : { response: "string" },
      input: options.hermesInput ?? { prompt: options.user },
      brainFiles: options.brainFiles,
      temperature: options.temperature
    });

    return {
      ok: result.ok,
      json: result.json,
      text: result.rawContent,
      usage: { promptTokens: result.usage.tokensPrompt, completionTokens: result.usage.tokensCompletion, totalTokens: result.usage.tokensTotal },
      status: result.status,
      error: result.error,
      latencyMs: result.durationMs,
      model: result.modelUsed ?? model
    };
  }

  const providerModule = getProvider(provider);
  if (!isModelProvider(providerModule)) {
    return failedChat(new Error(`${provider} is not a model provider.`), now(), model);
  }

  return providerModule.chat(options);
}
