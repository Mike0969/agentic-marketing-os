import { openToken, sealToken, tokenKey } from "@/lib/social/token-crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Social app keys (client id + secret) from Settings (table social_app_keys, migration 0041), falling
 * back to env. The platform modules read them synchronously via appKey(); entry points (OAuth start /
 * callback, posting, Settings) call loadAppKeys() first, which refreshes a small in-memory cache.
 * Facebook and Instagram are separate rows; Instagram connects through Facebook Login, so by default
 * (no Instagram keys in Settings or env, or "use the same keys as Facebook") it uses the Facebook app.
 */

export type AppPlatform = "facebook" | "instagram" | "linkedin" | "x" | "tiktok";
export const APP_PLATFORMS: AppPlatform[] = ["facebook", "instagram", "linkedin", "x", "tiktok"];
export const isAppPlatform = (v: unknown): v is AppPlatform => typeof v === "string" && (APP_PLATFORMS as string[]).includes(v);

const ENV_NAMES: Record<AppPlatform, Array<[string, string]>> = {
  facebook: [["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"]],
  instagram: [["INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"]],
  linkedin: [["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]],
  x: [["X_CLIENT_ID", "X_CLIENT_SECRET"]],
  tiktok: [["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"]]
};

type Row = { platform: AppPlatform; client_id: string | null; client_secret_enc: string | null; secret_last4: string; use_facebook?: boolean | null; updated_at: string };
const ctx = (platform: AppPlatform) => ({ brandId: "app", platform: `social-app:${platform}`, field: "api_key" as const });

const TTL_MS = 60 * 1000;
let cache = new Map<string, string>();
let instagramUsesFacebook = false;
let loadedAt = 0;

/** Instagram has keys of its own (Settings or env) and was not told to use the Facebook ones. */
function instagramOwnKeys() {
  return !instagramUsesFacebook && Boolean(cache.get("INSTAGRAM_CLIENT_ID") || process.env.INSTAGRAM_CLIENT_ID);
}

/** The value the app uses for an env name: a Settings value first, else the server env. */
export function appKey(name: string): string | undefined {
  if (name.startsWith("INSTAGRAM_CLIENT_") && !instagramOwnKeys()) return appKey(name.replace("INSTAGRAM_", "FACEBOOK_"));
  return cache.get(name) || process.env[name] || undefined;
}

export async function loadAppKeys(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  const next = new Map<string, string>();
  let usesFacebook = false;
  try {
    const supabase = createServiceClient();
    if (supabase) {
      const { data } = await supabase.from("social_app_keys").select("*");
      for (const row of (data ?? []) as Row[]) {
        if (!isAppPlatform(row.platform)) continue;
        if (row.platform === "instagram" && row.use_facebook) {
          usesFacebook = true;
          continue;
        }
        if (!row.client_id) continue;
        let secret: string | null = null;
        try {
          secret = row.client_secret_enc ? openToken(row.client_secret_enc, ctx(row.platform)) : null;
        } catch {
          secret = null;
        }
        for (const [idName, secretName] of ENV_NAMES[row.platform]) {
          next.set(idName, row.client_id);
          if (secret) next.set(secretName, secret);
        }
      }
    }
  } catch {
    // no DB/table: env only
  }
  cache = next;
  instagramUsesFacebook = usesFacebook;
  loadedAt = Date.now();
}

export type PublicAppKeys = {
  platform: AppPlatform;
  source: "settings" | "env" | "none";
  clientId: string | null;
  secretLast4: string | null;
  secretSet: boolean;
  /** Instagram only: it uses the Facebook keys (ticked, or by default when it has none of its own). */
  usesFacebook?: boolean;
  /** Instagram only: "use the same keys as Facebook" was ticked in Settings. */
  usesFacebookChosen?: boolean;
};

export async function listAppKeysPublic(): Promise<PublicAppKeys[]> {
  let rows: Row[] = [];
  try {
    const supabase = createServiceClient();
    if (supabase) rows = (((await supabase.from("social_app_keys").select("*")).data ?? []) as Row[]);
  } catch {
    rows = [];
  }
  const list: PublicAppKeys[] = APP_PLATFORMS.map((platform) => {
    const row = rows.find((r) => r.platform === platform);
    if (row?.use_facebook) return { platform, source: "settings", clientId: null, secretLast4: null, secretSet: false, usesFacebook: true, usesFacebookChosen: true };
    if (row) return { platform, source: "settings", clientId: row.client_id, secretLast4: row.secret_last4 || null, secretSet: Boolean(row.client_secret_enc) };
    const [idName, secretName] = ENV_NAMES[platform][0];
    const id = process.env[idName];
    const secret = process.env[secretName];
    return id ? { platform, source: "env", clientId: id, secretLast4: secret ? secret.slice(-4) : null, secretSet: Boolean(secret) } : { platform, source: "none", clientId: null, secretLast4: null, secretSet: false };
  });
  const ig = list.find((k) => k.platform === "instagram")!;
  if (ig.source === "none") ig.usesFacebook = true;
  return list;
}

function clean(value: unknown, label: string, min: number) {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length < min) throw new Error(`Paste the ${label}.`);
  if (/[^\x21-\x7e]/.test(v)) throw new Error(`The ${label} contains spaces or non-ASCII characters (a placeholder such as "…"?).`);
  return v;
}

export async function setAppKeys(platform: unknown, clientId: unknown, clientSecret: unknown, useFacebook = false): Promise<void> {
  if (!isAppPlatform(platform)) throw new Error("Unknown platform.");
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase service client is not configured.");
  if (useFacebook) {
    if (platform !== "instagram") throw new Error("Only Instagram can use the Facebook keys.");
    const { error } = await supabase
      .from("social_app_keys")
      .upsert({ platform, client_id: null, client_secret_enc: null, secret_last4: "", use_facebook: true, updated_at: new Date().toISOString() }, { onConflict: "platform" });
    if (error) throw new Error(error.message);
    await loadAppKeys(true);
    return;
  }
  const id = clean(clientId, platform === "facebook" || platform === "instagram" ? "App ID" : platform === "tiktok" ? "Client key" : "Client ID", 2);
  const secretRaw = typeof clientSecret === "string" ? clientSecret.trim() : "";
  const patch: Record<string, unknown> = { platform, client_id: id, use_facebook: false, updated_at: new Date().toISOString() };
  if (secretRaw) {
    const secret = clean(secretRaw, "secret", 6);
    if (!tokenKey()) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not set on the server, so secrets cannot be stored encrypted.");
    const sealed = sealToken(secret, ctx(platform));
    if (!sealed?.startsWith("enc:")) throw new Error("The secret could not be encrypted.");
    patch.client_secret_enc = sealed;
    patch.secret_last4 = secret.slice(-4);
  } else if (platform !== "x") {
    const { data } = await supabase.from("social_app_keys").select("client_secret_enc").eq("platform", platform).maybeSingle();
    if (!(data as { client_secret_enc?: string | null } | null)?.client_secret_enc) throw new Error("Paste the secret too.");
  }
  const { error } = await supabase.from("social_app_keys").upsert(patch, { onConflict: "platform" });
  if (error) throw new Error(error.message);
  await loadAppKeys(true);
}

export async function removeAppKeys(platform: unknown): Promise<void> {
  if (!isAppPlatform(platform)) throw new Error("Unknown platform.");
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase service client is not configured.");
  const { error } = await supabase.from("social_app_keys").delete().eq("platform", platform);
  if (error) throw new Error(error.message);
  await loadAppKeys(true);
}
