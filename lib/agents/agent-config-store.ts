import {
  addLocalAgentTarget,
  readLocalAgentSettings,
  readLocalAgentTargets,
  removeLocalAgentTarget,
  updateLocalAgentTarget,
  upsertLocalAgentSetting
} from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AgentSetting, AgentTarget } from "@/lib/types";

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

/**
 * Resolve the model to use for an agent: explicit override, else fallback
 * (global env default). Never returns an empty string.
 */
export async function resolveAgentModel(agentId: string, fallback: string): Promise<string> {
  const settings = await listAgentSettings();
  const override = settings.find((setting) => setting.agent_id === agentId);
  return override?.model?.trim() ? override.model.trim() : fallback;
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
