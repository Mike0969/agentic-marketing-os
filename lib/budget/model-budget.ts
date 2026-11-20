import { AsyncLocalStorage } from "node:async_hooks";
import { MAX_ROUNDS } from "@/lib/marketing/rubrics";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Hard model-call budget (migration 0038). Every model call (Hermes, other LLM
 * providers, Jev) is charged here first; a call that would go over the cap for
 * the day (UTC) or for the running campaign is refused without reaching the
 * model. A provider usage limit (HTTP 429 "usage limit reached") trips a
 * breaker: no call is made until the limit resets.
 */

export type BudgetSettings = { perCampaignMax: number; perDayMax: number };

export type BudgetStatus = BudgetSettings & {
  usedToday: number;
  remainingToday: number;
  usedCampaign: number | null;
  remainingCampaign: number | null;
  blockedUntil: string | null;
  blockReason: string | null;
};

export const DEFAULT_BUDGET: BudgetSettings = { perCampaignMax: 40, perDayMax: 150 };

/** Upper bounds per step, used to refuse a run up front. */
export const CALL_ESTIMATE = {
  plan: 6, // Crina's plan + Jev, up to 2 reworks
  prepare: 2, // SEO + Analytics
  // content loop (maker + Crina's judge per round) + Jev on text (3 checks + 2 reworks)
  // + visual loop (2 rounds) + Jev on visual (3 + 2)
  perPlatform: MAX_ROUNDS * 2 + 5 + 2 * 2 + 5,
  runOverhead: 1, // conversion analysis after a run
  rework: 3,
  // "Edit and approve": Mihai's text is used as is (no content loop, no Jev on text): visual loop + Jev on visual.
  approvedTextPlatform: 2 * 2 + 5
};

const scope = new AsyncLocalStorage<{ campaignId: string | null }>();

/** Run fn with model calls charged to this campaign. */
export function withCampaignBudget<T>(campaignId: string | null, fn: () => Promise<T>): Promise<T> {
  return scope.run({ campaignId }, fn);
}

function db() {
  return createServiceClient();
}

const dayStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

export function formatReset(iso: string) {
  const at = new Date(iso);
  return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export function limitMessage(blockedUntil: string) {
  return `Hermes limit reached, resets at ${formatReset(blockedUntil)}.`;
}

export async function getBudgetStatus(campaignId: string | null = null): Promise<BudgetStatus | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data: row } = await supabase.from("model_budget").select("*").eq("id", 1).maybeSingle();
  const settings: BudgetSettings = {
    perCampaignMax: Number(row?.per_campaign_max ?? DEFAULT_BUDGET.perCampaignMax),
    perDayMax: Number(row?.per_day_max ?? DEFAULT_BUDGET.perDayMax)
  };
  const { count: usedToday } = await supabase.from("model_calls").select("id", { count: "exact", head: true }).gte("at", dayStart());
  let usedCampaign: number | null = null;
  if (campaignId) {
    const { count } = await supabase.from("model_calls").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
    usedCampaign = count ?? 0;
  }
  const blockedUntil = row?.hermes_blocked_until && new Date(row.hermes_blocked_until).getTime() > Date.now() ? String(row.hermes_blocked_until) : null;
  return {
    ...settings,
    usedToday: usedToday ?? 0,
    remainingToday: Math.max(0, settings.perDayMax - (usedToday ?? 0)),
    usedCampaign,
    remainingCampaign: usedCampaign === null ? null : Math.max(0, settings.perCampaignMax - usedCampaign),
    blockedUntil,
    blockReason: blockedUntil ? (row?.hermes_block_reason ?? null) : null
  };
}

/** Refuse a run up front if it could exceed the budget or a provider limit is active. Null = OK. */
export async function preflight(campaignId: string | null, estimatedCalls: number): Promise<string | null> {
  const status = await getBudgetStatus(campaignId);
  if (!status) return null;
  if (status.blockedUntil) return limitMessage(status.blockedUntil);
  if (estimatedCalls > status.remainingToday) {
    return `Model-call budget: this step can use up to ${estimatedCalls} calls but only ${status.remainingToday} of ${status.perDayMax} are left today (resets 00:00 UTC). Raise it in Settings or wait.`;
  }
  if (status.remainingCampaign !== null && estimatedCalls > status.remainingCampaign) {
    return `Model-call budget: this campaign has ${status.remainingCampaign} of ${status.perCampaignMax} calls left and this step can use up to ${estimatedCalls}. Raise it in Settings.`;
  }
  return null;
}

/** Charge one call before it is made. Returns an error message when it must not be made. */
export async function chargeModelCall(kind: string, agentId: string | null = null): Promise<string | null> {
  const supabase = db();
  if (!supabase) return null; // local mode: no shared budget store
  const campaignId = scope.getStore()?.campaignId ?? null;
  const status = await getBudgetStatus(campaignId);
  if (!status) return null;
  if (status.blockedUntil) return limitMessage(status.blockedUntil);
  if (status.remainingToday <= 0) return `Model-call budget for today is used up (${status.perDayMax}); resets 00:00 UTC.`;
  if (status.remainingCampaign !== null && status.remainingCampaign <= 0) return `This campaign's model-call budget is used up (${status.perCampaignMax}).`;
  await supabase.from("model_calls").insert({ at: new Date().toISOString(), campaign_id: campaignId, kind, agent_id: agentId });
  return null;
}

const USAGE_LIMIT = /usage[ _]limit|rate[ _]limit|\b429\b|too many requests/i;
// Hermes's own "every provider failed" message (primary AND its fallback, e.g. DeepSeek), as opposed to
// an answer that merely mentions a limit. Hermes falls back by itself; we stop only on a real failure.
const HERMES_FAILED = /API call failed after \d+ retr|usage_limit_reached|Error code: 429|HTTP 429:/i;

export function isUsageLimit(text: string | null | undefined) {
  return Boolean(text && USAGE_LIMIT.test(text));
}

/** True only when Hermes reports that it could not get an answer from any provider because of a limit. */
export function isHermesLimitFailure(text: string | null | undefined) {
  return Boolean(text && HERMES_FAILED.test(text) && USAGE_LIMIT.test(text));
}

/** When the provider says it resets: resets_at (unix seconds) or resets_in_sec; else one hour. */
export function parseResetAt(text: string, now = Date.now()): string {
  const at = text.match(/resets_at['"]?\s*[:=]\s*(\d{10})/);
  if (at) return new Date(Number(at[1]) * 1000).toISOString();
  const inSec = text.match(/resets_in_sec['"]?\s*[:=]\s*(\d+)/);
  if (inSec) return new Date(now + Number(inSec[1]) * 1000).toISOString();
  return new Date(now + 60 * 60 * 1000).toISOString();
}

/** Trip the breaker after a provider usage limit; returns the message to show. */
export async function tripUsageLimit(text: string): Promise<string> {
  const until = parseResetAt(text);
  const supabase = db();
  if (supabase) {
    await supabase.from("model_budget").update({ hermes_blocked_until: until, hermes_block_reason: text.replace(/\s+/g, " ").slice(0, 300), updated_at: new Date().toISOString() }).eq("id", 1);
  }
  return limitMessage(until);
}

export async function saveBudgetSettings(settings: BudgetSettings) {
  const supabase = db();
  if (!supabase) return null;
  const { error } = await supabase.from("model_budget").upsert({ id: 1, per_campaign_max: settings.perCampaignMax, per_day_max: settings.perDayMax, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}
