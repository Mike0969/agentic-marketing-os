import { resolveChannel } from "@/lib/notify/channels";
import { send as sendSlack } from "@/lib/providers/slack";
import { send as sendTelegram } from "@/lib/providers/telegram";

// Every alert names its source: they go out through the Hermes bots, and without this line the
// readers (and Hermes itself) can't tell the Marketing OS sent them.
const SOURCE = "🤖 Agentic Marketing OS";

export function fromOS(text: string): string {
  return `${SOURCE}\n${text}`;
}

// Operator alerts (logins, post published, publish errors, weekly summary) to the platform's Telegram
// and, when configured, the same text to Slack (a channel C… or a direct message D…). Each channel is
// the one set in Settings → Notifications first, else the server env (TELEGRAM_BOT_TOKEN/CHAT_ID,
// SLACK_BOT_TOKEN/CHANNEL_ID). Best-effort and a no-op per channel when unconfigured, so it never blocks
// the caller.
export async function notifyOperator(text: string): Promise<void> {
  const message = fromOS(text);
  const ch = await resolveChannel("telegram").catch(() => null);
  if (ch) {
    try {
      await sendTelegram(ch.channelId, message, ch.token);
    } catch {
      // notifications are best-effort
    }
  }
  await notifySlack(message);
}

// Sends `text` as-is; callers pass an already-headed message (see fromOS).
export async function notifySlack(text: string): Promise<{ ok: boolean; error?: string | null } | null> {
  const ch = await resolveChannel("slack").catch(() => null);
  if (!ch) return null;
  try {
    const r = await sendSlack(ch.channelId.trim(), text, ch.token);
    // One line in the server log per Slack alert (ok or Slack's error code; never the token).
    console.info(`[notify] slack ${ch.source} ${ch.channelId.trim().charAt(0)}…: ${r.ok ? "ok" : `error ${r.error ?? "unknown"}`}`);
    return { ok: r.ok, error: r.ok ? null : r.error ?? null };
  } catch {
    // notifications are best-effort
    return { ok: false, error: "send threw" };
  }
}
