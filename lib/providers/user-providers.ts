import { randomUUID } from "node:crypto";
import { checkCompatKey, compatChat, baseUrlFor, isProviderKind, listCompatModels, PROVIDER_KINDS, type CompatTarget, type ProviderKind } from "@/lib/providers/compat";
import { openToken, sealToken, tokenKey } from "@/lib/social/token-crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Model providers added from Settings (table model_providers, migration 0039). The API key is encrypted
 * at rest and never returned to the browser: only "…last4". A UI provider of the same kind as an env
 * provider takes priority over the env key. Models are the provider's real /models list, cached 6 h.
 */

export const USER_PROVIDER_PREFIX = "custom:";
const MODELS_TTL_MS = 6 * 60 * 60 * 1000;

type Row = {
  id: string; kind: ProviderKind; name: string; base_url: string | null; api_key_enc: string; key_last4: string; enabled: boolean;
  models_cache: string[]; models_cached_at: string | null; last_test_ok: boolean | null; last_test_at: string | null; last_test_detail: string | null;
  created_at: string; updated_at: string;
};

/** What the browser may see: never the key. */
export type PublicProvider = Omit<Row, "api_key_enc"> & { label: string; providerKey: string };

const ctx = (id: string) => ({ brandId: id, platform: "model-provider", field: "api_key" as const });

function db() {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase service client is not configured.");
  return supabase;
}

export function toPublic(row: Row): PublicProvider {
  const { api_key_enc: _secret, ...rest } = row;
  return { ...rest, models_cache: Array.isArray(row.models_cache) ? row.models_cache : [], label: PROVIDER_KINDS[row.kind]?.label ?? row.kind, providerKey: `${USER_PROVIDER_PREFIX}${row.id}` };
}

/** Encrypt or refuse: a provider key is never stored in clear. */
function sealKey(id: string, apiKey: string) {
  if (!tokenKey()) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not set on the server, so keys cannot be stored encrypted.");
  const sealed = sealToken(apiKey, ctx(id));
  if (!sealed || !sealed.startsWith("enc:")) throw new Error("The key could not be encrypted.");
  return sealed;
}

export function last4(key: string) {
  return key.slice(-4);
}

function cleanKey(apiKey: unknown) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (key.length < 8) throw new Error("Paste the full API key.");
  if (/[^\x21-\x7e]/.test(key)) throw new Error("The key contains spaces or non-ASCII characters (a placeholder such as \"…\"?).");
  return key;
}

export async function listUserProviders(): Promise<PublicProvider[]> {
  const { data, error } = await db().from("model_providers").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toPublic);
}

async function getRow(id: string): Promise<Row | null> {
  const { data } = await db().from("model_providers").select("*").eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function addUserProvider(input: { kind: unknown; name: unknown; apiKey: unknown; baseUrl?: unknown }): Promise<PublicProvider> {
  if (!isProviderKind(input.kind)) throw new Error("Choose a provider type.");
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : PROVIDER_KINDS[input.kind].label;
  const key = cleanKey(input.apiKey);
  let baseUrl: string | null = null;
  if (input.kind === "custom") {
    baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim().replace(/\/+$/, "") : "";
    if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error("A custom provider needs its OpenAI-compatible base URL (https://…/v1).");
  }
  const id = randomUUID();
  const { data, error } = await db()
    .from("model_providers")
    .insert({ id, kind: input.kind, name, base_url: baseUrl, api_key_enc: sealKey(id, key), key_last4: last4(key), enabled: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toPublic(data as Row);
}

export async function updateUserProvider(id: string, patch: { name?: unknown; enabled?: unknown; apiKey?: unknown; baseUrl?: unknown }): Promise<PublicProvider> {
  const row = await getRow(id);
  if (!row) throw new Error("Provider not found.");
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string" && patch.name.trim()) next.name = patch.name.trim().slice(0, 80);
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (patch.apiKey !== undefined) {
    const key = cleanKey(patch.apiKey);
    next.api_key_enc = sealKey(id, key);
    next.key_last4 = last4(key);
    next.models_cache = [];
    next.models_cached_at = null;
    next.last_test_ok = null;
  }
  if (row.kind === "custom" && typeof patch.baseUrl === "string") {
    const baseUrl = patch.baseUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error("Base URL must start with https://");
    next.base_url = baseUrl;
  }
  const { data, error } = await db().from("model_providers").update(next).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return toPublic(data as Row);
}

export async function removeUserProvider(id: string) {
  const { error } = await db().from("model_providers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

function target(row: Row): CompatTarget {
  const apiKey = openToken(row.api_key_enc, ctx(row.id));
  if (!apiKey) throw new Error("The stored key is empty.");
  return { kind: row.kind, baseUrl: baseUrlFor(row.kind, row.base_url), apiKey };
}

export async function refreshUserProviderModels(id: string, force = false): Promise<string[]> {
  const row = await getRow(id);
  if (!row) throw new Error("Provider not found.");
  const fresh = row.models_cached_at && Date.now() - new Date(row.models_cached_at).getTime() < MODELS_TTL_MS;
  if (fresh && !force && row.models_cache?.length) return row.models_cache;
  const models = await listCompatModels(target(row));
  await db().from("model_providers").update({ models_cache: models, models_cached_at: new Date().toISOString() }).eq("id", id);
  return models;
}

/** Cheap "is the key accepted": the /models call (no tokens spent). */
export async function testUserProvider(id: string): Promise<{ ok: boolean; detail: string; models: number }> {
  let ok = false;
  let detail = "";
  let models = 0;
  try {
    const row = await getRow(id);
    if (!row) throw new Error("Provider not found.");
    await checkCompatKey(target(row));
    const list = await refreshUserProviderModels(id, true);
    models = list.length;
    ok = true;
    detail = `Key accepted; ${models} chat models.`;
  } catch (error) {
    detail = error instanceof Error ? error.message : "Test failed.";
  }
  await db().from("model_providers").update({ last_test_ok: ok, last_test_at: new Date().toISOString(), last_test_detail: detail.slice(0, 300) }).eq("id", id);
  return { ok, detail, models };
}

/** The enabled UI provider for an agent's provider id ("custom:<uuid>") or, for priority, of a kind. */
export async function resolveUserProvider(providerKey: string): Promise<{ row: Row; target: CompatTarget } | null> {
  let row: Row | null = null;
  if (providerKey.startsWith(USER_PROVIDER_PREFIX)) {
    row = await getRow(providerKey.slice(USER_PROVIDER_PREFIX.length));
  } else if (isProviderKind(providerKey) && providerKey !== "custom") {
    const { data } = await db().from("model_providers").select("*").eq("kind", providerKey).eq("enabled", true).order("updated_at", { ascending: false }).limit(1);
    row = ((data ?? []) as Row[])[0] ?? null;
  }
  if (!row || !row.enabled) return null;
  return { row, target: target(row) };
}

export async function chatWithUserProvider(providerKey: string, model: string, options: Parameters<typeof compatChat>[2]) {
  const resolved = await resolveUserProvider(providerKey);
  if (!resolved) return null;
  return { kind: resolved.row.kind, result: await compatChat(resolved.target, model, options) };
}
