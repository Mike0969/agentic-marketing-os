import { jevCheck } from "@/lib/jev/jev";

/**
 * Jev readiness for Settings: one smoke check on a claim Jev must reject ("3x more than Uber"),
 * cached for 6 hours so viewing Settings does not spend Jev calls.
 */
export type JevStatus = { state: "ready" | "not_configured" | "error" | "checking"; detail: string; checkedAt: string | null; score: number | null };

const TTL_MS = 6 * 60 * 60 * 1000;
let cached: { at: number; status: JevStatus } | null = null;

let inflight: Promise<JevStatus> | null = null;

/** Non-blocking for page renders: the cached status (even if stale) or "checking", refreshed in the background. */
export function peekJevStatus(): JevStatus {
  if (!process.env.TYPESAFE_API_KEY) return { state: "not_configured", detail: "TYPESAFE_API_KEY is not set.", checkedAt: null, score: null };
  const stale = !cached || Date.now() - cached.at >= TTL_MS;
  if (stale && !inflight) {
    inflight = getJevStatus(true).finally(() => { inflight = null; });
    inflight.catch(() => {});
  }
  return cached?.status ?? { state: "checking", detail: "Smoke check running; reload in a few seconds.", checkedAt: null, score: null };
}

export async function getJevStatus(force = false): Promise<JevStatus> {
  if (!process.env.TYPESAFE_API_KEY) return { state: "not_configured", detail: "TYPESAFE_API_KEY is not set.", checkedAt: null, score: null };
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.status;
  const r = await jevCheck({
    kind: "text",
    idea: "Smoke check",
    brand: { name: "NexRide", approval_rules: "Never invent numbers or results." },
    learning: "",
    subject: "NexRide drivers earn 3x more than Uber drivers."
  });
  const caught = r.ran && (r.answers.no_invented ?? 1) < 0.85;
  const status: JevStatus = !r.ran
    ? { state: "error", detail: r.note ?? "Jev did not run.", checkedAt: new Date().toISOString(), score: null }
    : { state: caught ? "ready" : "error", detail: caught ? `caught the invented "3x more" claim (${(r.answers.no_invented ?? 0).toFixed(2)})` : "smoke check did NOT flag an invented claim", checkedAt: new Date().toISOString(), score: r.answers.no_invented ?? null };
  cached = { at: Date.now(), status };
  return status;
}
