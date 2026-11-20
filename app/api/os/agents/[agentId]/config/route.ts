import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAgentConfig, upsertAgentConfig } from "@/lib/agents/agent-config-store";
import { getProvider, getProviderMeta, isProviderKey } from "@/lib/providers/registry";
import { chatModels } from "@/lib/providers/compat";
import { refreshUserProviderModels, resolveUserProvider, USER_PROVIDER_PREFIX } from "@/lib/providers/user-providers";
import type { ModelProviderModule } from "@/lib/providers/types";

export const runtime = "nodejs";

function isModelProvider(module: unknown): module is ModelProviderModule {
  return Boolean(module && typeof module === "object" && "chat" in module);
}

async function validateProviderModel(provider: string, model: string) {
  if (provider.startsWith(USER_PROVIDER_PREFIX)) {
    const user = await resolveUserProvider(provider).catch(() => null);
    if (!user) return "That provider was removed or is disabled in Settings.";
    const models = await refreshUserProviderModels(user.row.id).catch(() => [] as string[]);
    return models.includes(model) ? null : `Model ${model} was not found for ${user.row.name}.`;
  }
  if (!isProviderKey(provider)) return "Unknown provider.";
  const meta = getProviderMeta(provider);
  if (meta.kind !== "model") return "Agent model provider must be a model provider.";
  const providerModule = getProvider(provider);
  if (!isModelProvider(providerModule)) return "Provider cannot run model calls.";
  const models = await providerModule.listModels();
  const ids = models.models.map((item) => item.id);
  if (!(provider === "hermes" ? ids : chatModels(ids)).includes(model)) return `Model ${model} was not found for provider ${provider}.`;
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { agentId } = await context.params;
  const config = await getAgentConfig(agentId);
  return NextResponse.json({ agentId, config });
}

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { agentId } = await context.params;
  const body = (await request.json().catch(() => null)) as { provider?: unknown; model?: unknown } | null;
  const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";

  if (!provider || !model) {
    return NextResponse.json({ error: "provider and model are required." }, { status: 400 });
  }

  const validationError = await validateProviderModel(provider, model);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const config = await upsertAgentConfig({ agentId, provider, model, updatedBy: admin.email });
  return NextResponse.json({ agentId, provider: config.provider, model: config.model, config });
}
