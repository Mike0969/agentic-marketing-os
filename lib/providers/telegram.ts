import { resolveChannel } from "@/lib/notify/channels";
import { connectedHealth, elapsed, errorHealth, failedTest, missingHealth, nonAsciiProblem, now, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = "https://api.telegram.org";

// Token + chat id: the Settings channel first (encrypted in the DB), else TELEGRAM_* env.
export async function healthCheck() {
  const ch = await resolveChannel("telegram");
  const botToken = ch?.token;
  if (!botToken) return missingHealth("Telegram is not configured (Settings → Notifications).");
  const startedAt = now();
  const bad = nonAsciiProblem({ "Telegram bot token": botToken });
  if (bad) return errorHealth(new Error(bad), startedAt);
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

export async function send(chatId: string, text: string, tokenOverride?: string) {
  const startedAt = now();
  const botToken = tokenOverride ?? (await resolveChannel("telegram"))?.token;
  if (!botToken) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: "Telegram is not configured." };
  const bad = nonAsciiProblem({ "Telegram bot token": botToken });
  if (bad) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: bad };
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
  const ch = await resolveChannel("telegram");
  if (!ch) return failedTest(new Error("Telegram is not configured."), startedAt, "telegram");
  const result = await send(ch.channelId, prompt || "Agentic OS test", ch.token);
  return { ok: result.ok, model: "telegram", response: result.response, latencyMs: result.latencyMs, error: result.error };
}
