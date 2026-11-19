// The one place social_connections tokens are written and read, so encryption at rest
// (lib/social/token-crypto.ts) cannot be bypassed by a caller.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEncrypted, openToken, sealToken, tokenKey } from "@/lib/social/token-crypto";

type Db = Pick<SupabaseClient, "from">;
type Env = Record<string, string | undefined>;

export type ConnectionTokens = { access_token: string | null; refresh_token: string | null };

export type Connection = ConnectionTokens & {
  expires_at: string | null;
  author_urn: string | null;
  status: string;
};

/** Seals both tokens for storage and reports whether they ended up encrypted. */
export function sealTokens(brandId: string, platform: string, tokens: ConnectionTokens, env: Env = process.env) {
  const access_token = sealToken(tokens.access_token, { brandId, platform, field: "access_token" }, env);
  const refresh_token = sealToken(tokens.refresh_token, { brandId, platform, field: "refresh_token" }, env);
  const tokens_encrypted = [access_token, refresh_token].every((v) => v == null || v === "" || isEncrypted(v)) && Boolean(tokenKey(env));
  return { access_token, refresh_token, tokens_encrypted };
}

/** Upserts a connection row with sealed tokens (one row per brand + platform). */
export async function saveConnection(
  db: Db,
  row: { brand_id: string; platform: string } & ConnectionTokens & Record<string, unknown>,
  env: Env = process.env
) {
  const sealed = sealTokens(row.brand_id, row.platform, row, env);
  return db.from("social_connections").upsert({ ...row, ...sealed }, { onConflict: "brand_id,platform" });
}

/** Updates tokens (and any other fields) on an existing connection, sealing the tokens. */
export async function updateConnectionTokens(
  db: Db,
  brandId: string,
  platform: string,
  patch: Partial<ConnectionTokens> & Record<string, unknown>,
  env: Env = process.env
) {
  const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if ("access_token" in patch) next.access_token = sealToken(patch.access_token, { brandId, platform, field: "access_token" }, env);
  if ("refresh_token" in patch) next.refresh_token = sealToken(patch.refresh_token, { brandId, platform, field: "refresh_token" }, env);
  return db.from("social_connections").update(next).eq("brand_id", brandId).eq("platform", platform);
}

/**
 * Reads the connected account for a brand + platform with tokens decrypted. Legacy
 * plaintext rows are re-encrypted in place once a key is configured (best effort).
 */
export async function loadConnection(
  db: Db,
  brandId: string,
  platform: string,
  env: Env = process.env
): Promise<{ ok: true; conn: Connection | null } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("social_connections")
    .select("access_token,refresh_token,expires_at,author_urn,status")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .eq("status", "connected")
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the ${platform} connection: ${error.message}` };
  const row = data as Connection | null;
  if (!row) return { ok: true, conn: null };
  try {
    const conn: Connection = {
      ...row,
      access_token: openToken(row.access_token, { brandId, platform, field: "access_token" }, env),
      refresh_token: openToken(row.refresh_token, { brandId, platform, field: "refresh_token" }, env)
    };
    const legacy = [row.access_token, row.refresh_token].some((v) => typeof v === "string" && v !== "" && !isEncrypted(v));
    if (legacy && tokenKey(env)) {
      const sealed = sealTokens(brandId, platform, conn, env);
      // Compare-and-set on the raw stored value so a concurrent refresh is never overwritten.
      let q = db.from("social_connections").update({ ...sealed, updated_at: new Date().toISOString() }).eq("brand_id", brandId).eq("platform", platform);
      q = row.access_token == null ? q.is("access_token", null) : q.eq("access_token", row.access_token);
      await q;
    }
    return { ok: true, conn };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `The ${platform} token could not be read.` };
  }
}
