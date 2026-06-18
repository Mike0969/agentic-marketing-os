import { addLocalModel, readLocalModelRegistry, removeLocalModel } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ModelRegistryEntry } from "@/lib/types";

const DEFAULT_MODELS: ModelRegistryEntry[] = [
  { id: "default-gpt-5-5", name: "gpt-5.5", provider: "hermes", notes: "Default brain model", enabled: true },
  { id: "default-deepseek", name: "deepseek-v4-flash", provider: "hermes", notes: "Fast/cheap backup", enabled: true }
];

export async function listModels(): Promise<ModelRegistryEntry[]> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase.from("model_registry").select("*").order("created_at", { ascending: true });
      if (!error && data?.length) return data as ModelRegistryEntry[];
    }
  }

  const local = await readLocalModelRegistry();
  return local.length ? local : DEFAULT_MODELS;
}

/** Just the enabled model names, for dropdowns. Always includes the two defaults. */
export async function listModelNames(): Promise<string[]> {
  const models = await listModels();
  const names = models.filter((model) => model.enabled).map((model) => model.name);
  return Array.from(new Set([...names, "gpt-5.5", "deepseek-v4-flash"]));
}

export async function addModel(input: { name: string; provider?: string; notes?: string }): Promise<ModelRegistryEntry> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase
        .from("model_registry")
        .insert({ name: input.name, provider: input.provider ?? "", notes: input.notes ?? "" })
        .select("*")
        .single();
      if (!error && data) return data as ModelRegistryEntry;
    }
  }
  return addLocalModel({ name: input.name, provider: input.provider ?? "", notes: input.notes });
}

export async function removeModel(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { error } = await supabase.from("model_registry").delete().eq("id", id);
      if (!error) return true;
    }
  }
  return removeLocalModel(id);
}
