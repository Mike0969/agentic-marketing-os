import { randomUUID } from "node:crypto";
import { openToken, sealToken, tokenKey } from "@/lib/social/token-crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Telegram / Slack channels managed from Settings (table notification_channels, migration 0039).
 * The bot token is encrypted at rest and never returned (only "…last4"). Resolution: the newest
 * enabled UI channel of that kind first, else the env values (TELEGRAM_* / SLACK_*), read-only.
 */

export type ChannelKind = "telegram" | "slack";
export const isChannelKind = (v: unknown): v is ChannelKind => v === "telegram" || v === "slack";

type Row = {
  id: string; kind: ChannelKind; name: string; token_enc: string; token_last4: string; channel_id: string; enabled: boolean;
  last_test_ok: boolean | null; last_test_at: string | null; last_test_detail: string | null; created_at: string; updated_at: string;
};
export type PublicChannel = Omit<Row, "token_enc">;

const ctx = (id: string) => ({ brandId: id, platform: "notification-channel", field: "bot_token" as const });

function db() {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase service client is not configured.");
  return supabase;
}

const toPublic = ({ token_enc: _secret, ...rest }: Row): PublicChannel => rest;

function clean(value: unknown, label: string, min: number) {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length < min) throw new Error(`Paste the ${label}.`);
  if (/[^\x21-\x7e]/.test(v)) throw new Error(`The ${label} contains spaces or non-ASCII characters (a placeholder such as "…"?).`);
  return v;
}

function seal(id: string, token: string) {
  if (!tokenKey()) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not set on the server, so tokens cannot be stored encrypted.");
  const sealed = sealToken(token, ctx(id));
  if (!sealed || !sealed.startsWith("enc:")) throw new Error("The token could not be encrypted.");
  return sealed;
}

export async function listChannels(): Promise<PublicChannel[]> {
  const { data, error } = await db().from("notification_channels").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toPublic);
}

export async function addChannel(input: { kind: unknown; name: unknown; token: unknown; channelId: unknown }): Promise<PublicChannel> {
  if (!isChannelKind(input.kind)) throw new Error("Choose Telegram or Slack.");
  const token = clean(input.token, input.kind === "telegram" ? "bot token" : "bot token (xoxb-…)", 10);
  const channelId = clean(input.channelId, input.kind === "telegram" ? "chat id" : "channel id", 2);
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : input.kind === "telegram" ? "Telegram" : "Slack";
  const id = randomUUID();
  const { data, error } = await db().from("notification_channels").insert({ id, kind: input.kind, name, token_enc: seal(id, token), token_last4: token.slice(-4), channel_id: channelId, enabled: true }).select("*").single();
  if (error) throw new Error(error.message);
  return toPublic(data as Row);
}

export async function updateChannel(id: string, patch: { name?: unknown; enabled?: unknown; token?: unknown; channelId?: unknown }): Promise<PublicChannel> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string" && patch.name.trim()) next.name = patch.name.trim().slice(0, 80);
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (patch.token !== undefined) {
    const token = clean(patch.token, "bot token", 10);
    next.token_enc = seal(id, token);
    next.token_last4 = token.slice(-4);
    next.last_test_ok = null;
  }
  if (patch.channelId !== undefined) next.channel_id = clean(patch.channelId, "channel id", 2);
  const { data, error } = await db().from("notification_channels").update(next).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Channel not found.");
  return toPublic(data as Row);
}

export async function removeChannel(id: string) {
  const { error } = await db().from("notification_channels").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type ResolvedChannel = { token: string; channelId: string; source: "ui" | "env"; id: string | null };

/** The channel the app sends to: newest enabled UI channel of the kind, else env, else null. */
export async function resolveChannel(kind: ChannelKind, id?: string): Promise<ResolvedChannel | null> {
  try {
    const supabase = createServiceClient();
    if (supabase) {
      let q = supabase.from("notification_channels").select("*").eq("kind", kind);
      q = id ? q.eq("id", id) : q.eq("enabled", true).order("updated_at", { ascending: false }).limit(1);
      const { data } = await q;
      const row = ((data ?? []) as Row[])[0];
      if (row) {
        const token = openToken(row.token_enc, ctx(row.id));
        if (token) return { token, channelId: row.channel_id, source: "ui", id: row.id };
      }
    }
  } catch {
    // no table / no DB: fall through to env
  }
  if (id) return null;
  const token = kind === "telegram" ? process.env.TELEGRAM_BOT_TOKEN : process.env.SLACK_BOT_TOKEN;
  const channelId = kind === "telegram" ? process.env.TELEGRAM_CHAT_ID : process.env.SLACK_CHANNEL_ID;
  return token && channelId ? { token, channelId, source: "env", id: null } : null;
}

export async function recordChannelTest(id: string, ok: boolean, detail: string) {
  await db().from("notification_channels").update({ last_test_ok: ok, last_test_at: new Date().toISOString(), last_test_detail: detail.slice(0, 300) }).eq("id", id);
}
