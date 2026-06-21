import { connectedHealth, elapsed, errorHealth, failedTest, missingHealth, now, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = "https://api.telegram.org";

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function defaultChatId() {
  return process.env.TELEGRAM_CHAT_ID;
}

export async function healthCheck() {
  const botToken = token();
  if (!botToken) return missingHealth("TELEGRAM_BOT_TOKEN is not configured.");
  const startedAt = now();
  try {
    const response = await fetch(`${BASE_URL}/bot${botToken}/getMe`, { signal: timeoutSignal() });
    if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}.`);
    const data = (await response.json()) as { ok?: boolean; result?: { username?: string } };
    if (!data.ok) throw new Error("Telegram getMe returned ok:false.");
    return connectedHealth(data.result?.username ? `Bot @${data.result.username}` : "OK", startedAt);
  } catch (error) {
    return errorHealth(error, startedAt);
  }
}

export async function listModels() {
  return staticModels([]);
}

export async function send(chatId: string, text: string) {
  const startedAt = now();
  const botToken = token();
  if (!botToken) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: "TELEGRAM_BOT_TOKEN is not configured." };
  try {
    const response = await fetch(`${BASE_URL}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: timeoutSignal()
    });
    if (!response.ok) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: `Telegram returned HTTP ${response.status}.` };
    return { ok: true, response: "message sent", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return { ok: false, response: "", latencyMs: elapsed(startedAt), error: error instanceof Error ? error.message : "Telegram send failed." };
  }
}

export async function testCall(prompt: string) {
  const startedAt = now();
  const chatId = defaultChatId();
  if (!chatId) return failedTest(new Error("TELEGRAM_CHAT_ID is not configured."), startedAt, "telegram");
  const result = await send(chatId, prompt || "Agentic OS test");
  return { ok: result.ok, model: "telegram", response: result.response, latencyMs: result.latencyMs, error: result.error };
}
