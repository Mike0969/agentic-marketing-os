import { runHermesAgent, type HermesAgentCallOptions } from "@/lib/agents/hermes-client";
import { beginModelCall, finishModelCall } from "@/lib/budget/model-budget";
import { chatWithUserProvider, resolveUserProvider, USER_PROVIDER_PREFIX } from "@/lib/providers/user-providers";
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

/** A UI-added provider: "custom:<id>", or an enabled UI provider of an env kind (it takes priority). */
async function userProviderFor(provider: string) {
  try {
    return await resolveUserProvider(provider);
  } catch {
    return null; // no DB (local/tests) or no table yet: fall back to the env provider
  }
}

export async function callModel(options: CallModelOptions): Promise<ProviderChatResult> {
  const provider = options.provider as ProviderKey;
  const model = options.model;

  if (options.provider.startsWith(USER_PROVIDER_PREFIX) || ["openai", "deepseek", "anthropic"].includes(options.provider)) {
    const user = await userProviderFor(options.provider);
    if (user) {
      const { refused, id: callId } = await beginModelCall(user.row.kind, options.agentId, model);
      if (refused) return { ...failedChat(new Error(refused), now(), model, 429), rateLimited: true };
      const out = await chatWithUserProvider(options.provider, model, options);
      if (out) {
        await finishModelCall(callId, { provider: user.row.kind, model: out.result.model ?? model, tokensIn: out.result.usage?.promptTokens ?? null, tokensOut: out.result.usage?.completionTokens ?? null });
        return out.result;
      }
    } else if (options.provider.startsWith(USER_PROVIDER_PREFIX)) {
      return failedChat(new Error("This provider was removed or disabled in Settings. Pick another model for the agent."), now(), model);
    }
  }

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
      model: result.modelUsed ?? model,
      rateLimited: result.rateLimited === true
    };
  }

  const providerModule = getProvider(provider);
  if (!isModelProvider(providerModule)) {
    return failedChat(new Error(`${provider} is not a model provider.`), now(), model);
  }

  const { refused, id: callId } = await beginModelCall(provider, options.agentId, model);
  if (refused) return { ...failedChat(new Error(refused), now(), model, 429), rateLimited: true };
  const result = await providerModule.chat(options);
  await finishModelCall(callId, { provider, model: result.model ?? model, tokensIn: result.usage?.promptTokens ?? null, tokensOut: result.usage?.completionTokens ?? null });
  return result;
}
