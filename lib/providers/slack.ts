import { resolveChannel } from "@/lib/notify/channels";
import { connectedHealth, elapsed, errorHealth, failedTest, missingHealth, nonAsciiProblem, now, staticModels, timeoutSignal } from "@/lib/providers/utils";

const BASE_URL = "https://slack.com/api";

// Token + channel: the Settings channel first (encrypted in the DB), else SLACK_* env.
function headers(botToken: string) {
  return { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" };
}

export async function healthCheck() {
  const ch = await resolveChannel("slack");
  if (!ch) return missingHealth("SLACK_BOT_TOKEN is not configured.");
  const startedAt = now();
  const bad = nonAsciiProblem({ SLACK_BOT_TOKEN: ch.token, SLACK_CHANNEL_ID: ch.channelId });
  if (bad) return errorHealth(new Error(bad), startedAt);
  const botToken = ch.token;
  try {
    const response = await fetch(`${BASE_URL}/auth.test`, { method: "POST", headers: headers(botToken), signal: timeoutSignal() });
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

export async function send(channelId: string, text: string, tokenOverride?: string) {
  const startedAt = now();
  const botToken = tokenOverride ?? (await resolveChannel("slack"))?.token;
  if (!botToken) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: "SLACK_BOT_TOKEN is not configured." };
  const bad = nonAsciiProblem({ SLACK_BOT_TOKEN: botToken, SLACK_CHANNEL_ID: channelId });
  if (bad) return { ok: false, response: "", latencyMs: elapsed(startedAt), error: bad };
  try {
    const response = await fetch(`${BASE_URL}/chat.postMessage`, {
      method: "POST",
      headers: headers(botToken),
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
  const ch = await resolveChannel("slack");
  if (!ch) return failedTest(new Error("SLACK_CHANNEL_ID is not configured."), startedAt, "slack");
  const result = await send(ch.channelId, prompt || "Agentic OS test", ch.token);
  return { ok: result.ok, model: "slack", response: result.response, latencyMs: result.latencyMs, error: result.error };
}
