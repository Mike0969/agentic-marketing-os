import { send as sendSlack } from "@/lib/providers/slack";
import { send as sendTelegram } from "@/lib/providers/telegram";

// Operator alerts (post published, publish errors) to the platform's own Telegram — the same
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID already configured for Crina's ready-to-post pings — and,
// when SLACK_BOT_TOKEN / SLACK_CHANNEL_ID are set, the same text to that Slack channel so the team
// sees it too. Best-effort and a no-op per channel when unconfigured, so it never blocks the publish path.
export async function notifyOperator(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (process.env.TELEGRAM_BOT_TOKEN && chatId) {
    try {
      await sendTelegram(chatId, text);
    } catch {
      // notifications are best-effort
    }
  }
  await notifySlack(text);
}

export async function notifySlack(text: string): Promise<void> {
  const channelId = process.env.SLACK_CHANNEL_ID?.trim();
  if (!process.env.SLACK_BOT_TOKEN || !channelId) return;
  try {
    await sendSlack(channelId, text);
  } catch {
    // notifications are best-effort
  }
}
