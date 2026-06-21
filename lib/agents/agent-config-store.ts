import {
  addLocalAgentTarget,
  readLocalAgentConfigs,
  readLocalAgentSettings,
  readLocalAgentTargets,
  removeLocalAgentTarget,
  updateLocalAgentTarget,
  upsertLocalAgentConfig,
  upsertLocalAgentSetting
} from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AgentConfig, AgentSetting, AgentTarget } from "@/lib/types";

/**
 * Per-agent model overrides + the editable team targets list. Supabase when
 * configured, local JSON store otherwise. All reads are safe to call from
 * server components and routes.
 */

export async function listAgentSettings(): Promise<AgentSetting[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase.from("agent_settings").select("agent_id, model, enabled, updated_at");
      if (!error && data) return data as AgentSetting[];
    }
  }
  return readLocalAgentSettings();
}

export async function listAgentConfigs(): Promise<AgentConfig[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase.from("agent_config").select("id, agent_id, provider, model, updated_at, updated_by");
      if (!error && data) return data as AgentConfig[];
    }
  }
  return readLocalAgentConfigs();
}

export async function getAgentConfig(agentId: string): Promise<AgentConfig | null> {
  const configs = await listAgentConfigs();
  return configs.find((config) => config.agent_id === agentId) ?? null;
}

export async function upsertAgentConfig(input: { agentId: string; provider: string; model: string; updatedBy?: string | null }): Promise<AgentConfig> {
  const payload = {
    agent_id: input.agentId,
    provider: input.provider,
    model: input.model,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? null
  };

  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase
        .from("agent_config")
        .upsert(payload, { onConflict: "agent_id" })
        .select("id, agent_id, provider, model, updated_at, updated_by")
        .single();
      if (!error && data) return data as AgentConfig;
    }
  }

  return upsertLocalAgentConfig(payload);
}

export async function resolveAgentRuntimeConfig(agentId: string, fallbackModel: string): Promise<{ provider: string; model: string; source: "agent_config" | "agent_settings" | "env" }> {
  const config = await getAgentConfig(agentId);
  if (config?.provider?.trim() && config.model?.trim()) {
    return { provider: config.provider.trim(), model: config.model.trim(), source: "agent_config" };
  }

  const settings = await listAgentSettings();
  const override = settings.find((setting) => setting.agent_id === agentId);
  if (override?.model?.trim()) {
    return { provider: "hermes", model: override.model.trim(), source: "agent_settings" };
  }

  return { provider: "hermes", model: fallbackModel, source: "env" };
}

/**
 * Resolve the model to use for an agent: explicit override, else fallback
 * (global env default). Never returns an empty string.
 */
export async function resolveAgentModel(agentId: string, fallback: string): Promise<string> {
  const config = await resolveAgentRuntimeConfig(agentId, fallback);
  return config.model;
}

export async function setAgentModel(agentId: string, model: string | null): Promise<AgentSetting> {
  const normalized = model && model.trim() ? model.trim() : null;

  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const payload = { agent_id: agentId, model: normalized, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("agent_settings").upsert(payload, { onConflict: "agent_id" }).select("agent_id, model, enabled, updated_at").single();
      if (!error && data) return data as AgentSetting;
    }
  }

  return upsertLocalAgentSetting({ agent_id: agentId, model: normalized });
}

export async function listAgentTargets(): Promise<AgentTarget[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase.from("agent_targets").select("*").order("created_at", { ascending: false });
      if (!error && data) return data as AgentTarget[];
    }
  }
  return readLocalAgentTargets();
}

export async function addAgentTarget(input: { label: string; type: AgentTarget["type"]; notes?: string }): Promise<AgentTarget> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase
        .from("agent_targets")
        .insert({ label: input.label, type: input.type, notes: input.notes ?? "" })
        .select("*")
        .single();
      if (!error && data) return data as AgentTarget;
    }
  }
  return addLocalAgentTarget(input);
}

export async function updateAgentTarget(id: string, patch: Partial<Pick<AgentTarget, "active" | "label" | "notes" | "type">>): Promise<AgentTarget | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase.from("agent_targets").update(patch).eq("id", id).select("*").single();
      if (!error && data) return data as AgentTarget;
    }
  }
  return updateLocalAgentTarget(id, patch);
}

export async function removeAgentTarget(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { error } = await supabase.from("agent_targets").delete().eq("id", id);
      if (!error) return true;
    }
  }
  return removeLocalAgentTarget(id);
}
