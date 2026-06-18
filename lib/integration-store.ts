import { makeActivity } from "@/lib/activity";
import { gscConnectionSummary, isGscConfigured } from "@/lib/analytics/search-console";
import { getIntegrationDisplayName, mergeIntegrationDefaults } from "@/lib/integrations";
import { markLocalIntegrationTested, readLocalIntegrations, upsertLocalIntegration } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { IntegrationConfig, IntegrationProvider, IntegrationStatus } from "@/lib/types";

/**
 * Some connectors are wired via env (server-side), not via secrets saved in the
 * Settings form: Hermes (HERMES_AGENT_ENDPOINT) and Google Search Console
 * (service account / OAuth / token). Reflect their real readiness so the badges
 * are truthful even when nothing was saved through the form.
 */
function withEnvBackedConnectors(configs: IntegrationConfig[]): IntegrationConfig[] {
  const gscReady = isGscConfigured();
  const hermesReady = Boolean(process.env.HERMES_AGENT_ENDPOINT);

  return configs.map((config) => {
    if (config.provider === "google-search-console" && gscReady && !config.configured) {
      return { ...config, configured: true, status: config.status === "connected" || config.status === "error" ? config.status : "configured" };
    }
    if (config.provider === "hermes" && hermesReady && !config.configured) {
      return { ...config, configured: true, status: config.status === "connected" || config.status === "error" ? config.status : "configured" };
    }
    return config;
  });
}

type SaveIntegrationInput = {
  provider: IntegrationProvider;
  displayName?: string;
  metadata: Record<string, string>;
  secret?: string;
};

export async function listIntegrationConfigs() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data, error } = await supabase.from("integration_configs").select(safeColumns).order("provider");
      if (!error) return withEnvBackedConnectors(mergeIntegrationDefaults((data ?? []) as IntegrationConfig[]));
    }
  }

  return withEnvBackedConnectors(mergeIntegrationDefaults(await readLocalIntegrations()));
}

export async function saveIntegrationConfig(input: SaveIntegrationInput) {
  const displayName = input.displayName ?? getIntegrationDisplayName(input.provider);
  const hasSecret = Boolean(input.secret?.trim());

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data: existing } = await supabase
        .from("integration_configs")
        .select("id, configured, secret_ref")
        .eq("provider", input.provider)
        .maybeSingle();
      const secretRef = hasSecret ? `vault:${input.provider}:${Date.now()}` : existing?.secret_ref ?? null;
      const payload = {
        provider: input.provider,
        display_name: displayName,
        metadata: input.metadata,
        status: hasSecret || existing?.configured ? "configured" : "not_configured",
        configured: hasSecret || existing?.configured || false,
        secret_ref: secretRef,
        updated_at: new Date().toISOString()
      };

      // TODO: Replace the secret_ref placeholder with Supabase Vault RPC once Vault is enabled in the project.
      // The browser never receives the secret value; this route stores only metadata and a server-side reference.
      const write = existing?.id
        ? await supabase.from("integration_configs").update(payload).eq("id", existing.id).select(safeColumns).single()
        : await supabase.from("integration_configs").insert(payload).select(safeColumns).single();

      if (!write.error && write.data) {
        await supabase.from("activity").insert(makeActivity("Integration settings updated", `${displayName} connection metadata was saved.`));
        return write.data as IntegrationConfig;
      }
    }
  }

  return upsertLocalIntegration({ provider: input.provider, displayName, metadata: input.metadata, hasSecret });
}

export async function testIntegration(provider: IntegrationProvider) {
  const checkedAt = new Date().toISOString();
  const config = (await listIntegrationConfigs()).find((item) => item.provider === provider);
  let status: IntegrationStatus = config?.configured ? "testable" : "not_configured";
  let message = config?.configured ? "Credentials exist. Live read test is scaffolded for this connector." : "No credentials have been saved for this connector.";

  if (provider === "hermes") {
    const endpoint = process.env.HERMES_AGENT_ENDPOINT || config?.metadata?.endpoint;
    if (!endpoint) {
      status = "not_configured";
      message = "Hermes endpoint is not configured.";
    } else {
      try {
        const result = endpoint.includes("/v1/chat/completions") ? await testHermesOpenAiEndpoint(endpoint) : await testHermesDirectEndpoint(endpoint);
        status = result.status;
        message = result.message;
      } catch (error) {
        status = "error";
        message = error instanceof Error ? error.message : "Hermes test failed.";
      }
    }
  }

  if (provider === "google-search-console") {
    const summary = await gscConnectionSummary();
    status = summary.anyConnected ? "connected" : "not_configured";
    message = summary.lines.length ? summary.lines.join(" ") : "Set per-brand Search Console tokens (server-side) to enable read-only pulls.";
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase && config?.provider) {
      await supabase
        .from("integration_configs")
        .update({ status, last_checked_at: checkedAt, updated_at: checkedAt })
        .eq("provider", provider);
      await supabase.from("activity").insert(makeActivity("Integration test completed", `${getIntegrationDisplayName(provider)} returned ${status}.`));
    }
  } else {
    await markLocalIntegrationTested(provider, status);
  }

  return { provider, status, message, last_checked_at: checkedAt };
}

const safeColumns = "id, provider, display_name, status, metadata, configured, last_checked_at";

async function testHermesDirectEndpoint(endpoint: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "health", source: "agentic-marketing-os" }),
    signal: AbortSignal.timeout(6000)
  });

  return {
    status: response.ok ? ("connected" as const) : ("error" as const),
    message: response.ok ? "Hermes direct endpoint responded." : `Hermes returned HTTP ${response.status}.`
  };
}

async function testHermesOpenAiEndpoint(endpoint: string) {
  const baseUrl = endpoint.replace(/\/v1\/chat\/completions\/?$/, "");
  const headers: Record<string, string> = {};

  if (process.env.HERMES_AGENT_TOKEN) {
    headers.Authorization = `Bearer ${process.env.HERMES_AGENT_TOKEN}`;
  }

  const health = await fetch(`${baseUrl}/health`, { headers, signal: AbortSignal.timeout(6000) });

  if (!health.ok) {
    return { status: "error" as const, message: `Hermes health returned HTTP ${health.status}.` };
  }

  const models = await fetch(`${baseUrl}/v1/models`, { headers, signal: AbortSignal.timeout(6000) });

  if (!models.ok) {
    return { status: "error" as const, message: `Hermes models returned HTTP ${models.status}.` };
  }

  return {
    status: "connected" as const,
    message: "Hermes API server is healthy and exposes OpenAI-compatible models. Chat completions are tested when Crina runs."
  };
}
