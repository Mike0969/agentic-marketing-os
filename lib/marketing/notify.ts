import { send as sendTelegram } from "@/lib/providers/telegram";

// Operator alerts (post published, publish errors) to the platform's own Telegram — the same
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID already configured for Crina's ready-to-post pings. Best-effort
// and a no-op when Telegram isn't configured, so it never blocks the publish path.
export async function notifyOperator(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    await sendTelegram(chatId, text);
  } catch {
    // notifications are best-effort
  }
}
