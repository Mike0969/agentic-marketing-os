import { connectedHealth, elapsed, errorHealth, failedTest, missingHealth, now, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = "https://slack.com/api";

function token() {
  return process.env.SLACK_BOT_TOKEN;
}

function defaultChannel() {
  return process.env.SLACK_CHANNEL_ID;
}

function headers() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

export async function healthCheck() {
  if (!token()) return missingHealth("SLACK_BOT_TOKEN is not configured.");
  const startedAt = now();
  try {
    const response = await fetch(`${BASE_URL}/auth.test`, { method: "POST", headers: headers(), signal: timeoutSignal() });
    if (!response.ok) throw new Error(`Slack returned HTTP ${response.status}.`);
    const data = (await response.json()) as { ok?: boolean; team?: string; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Slack auth.test returned ok:false.");
    return connectedHealth(data.team ? `Team ${data.team}` : "OK", startedAt);
  } catch (error) {
    return errorHealth(error, startedAt);
  }
}

export async function listModels() {
  return staticModels([]);
}

export async function send(channelId: string, text: string) {
  const startedAt = now();
  if (!token()) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: "SLACK_BOT_TOKEN is not configured." };
  try {
    const response = await fetch(`${BASE_URL}/chat.postMessage`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ channel: channelId, text }),
      signal: timeoutSignal()
    });
    if (!response.ok) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: `Slack returned HTTP ${response.status}.` };
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!data.ok) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: data.error ?? "Slack send failed." };
    return { ok: true, response: "message sent", latencyMs: elapsed(startedAt), error: null };
  } catch (error) {
    return { ok: false, response: "", latencyMs: elapsed(startedAt), error: error instanceof Error ? error.message : "Slack send failed." };
  }
}

export async function testCall(prompt: string) {
  const startedAt = now();
  const channelId = defaultChannel();
  if (!channelId) return failedTest(new Error("SLACK_CHANNEL_ID is not configured."), startedAt, "slack");
  const result = await send(channelId, prompt || "Agentic OS test");
  return { ok: result.ok, model: "slack", response: result.response, latencyMs: result.latencyMs, error: result.error };
}
