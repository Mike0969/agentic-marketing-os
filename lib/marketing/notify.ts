import { send as sendSlack } from "@/lib/providers/slack";
import { send as sendTelegram } from "@/lib/providers/telegram";

// Every alert names its source: they go out through the Hermes bots, and without this line the
// readers (and Hermes itself) can't tell the Marketing OS sent them.
const SOURCE = "🤖 Agentic Marketing OS";

export function fromOS(text: string): string {
  return `${SOURCE}\n${text}`;
}

// Operator alerts (logins, post published, publish errors, weekly summary) to the platform's own
// Telegram — the same TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID already configured for Crina's
// ready-to-post pings — and, when SLACK_BOT_TOKEN / SLACK_CHANNEL_ID are set, the same text to that
// Slack conversation so the team sees it too. Best-effort and a no-op per channel when unconfigured,
// so it never blocks the caller.
export async function notifyOperator(text: string): Promise<void> {
  const message = fromOS(text);
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (process.env.TELEGRAM_BOT_TOKEN && chatId) {
    try {
      await sendTelegram(chatId, message);
    } catch {
      // notifications are best-effort
    }
  }
  await notifySlack(message);
}

// Sends `text` as-is; callers pass an already-headed message (see fromOS).
export async function notifySlack(text: string): Promise<void> {
  const channelId = process.env.SLACK_CHANNEL_ID?.trim();
  if (!process.env.SLACK_BOT_TOKEN || !channelId) return;
  try {
    await sendSlack(channelId, text);
  } catch {
    // notifications are best-effort
  }
}
