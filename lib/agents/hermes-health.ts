import { resolveHermesEndpoint } from "@/lib/agents/hermes-client";

export type HermesHealth = { configured: boolean; connected: boolean; endpoint: string | null };

/**
 * Lightweight Hermes health probe for the OS shell badge. Resolves the endpoint
 * (env or integration), pings its /health with a short timeout. Never throws.
 */
export async function getHermesHealth(): Promise<HermesHealth> {
  const endpoint = await resolveHermesEndpoint();
  if (!endpoint) return { configured: false, connected: false, endpoint: null };

  try {
    const base = endpoint.replace(/\/v1\/chat\/completions\/?$/, "");
    const headers: Record<string, string> = {};
    if (process.env.HERMES_AGENT_TOKEN) headers.Authorization = `Bearer ${process.env.HERMES_AGENT_TOKEN}`;
    const response = await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(3000) });
    return { configured: true, connected: response.ok, endpoint };
  } catch {
    return { configured: true, connected: false, endpoint };
  }
}
