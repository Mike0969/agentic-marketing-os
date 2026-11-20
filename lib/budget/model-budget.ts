import { AsyncLocalStorage } from "node:async_hooks";
import { createServiceClient } from "@/lib/supabase/service";

export const VISUAL_ROUNDS = 2;
export const CONTENT_ROUNDS = 2; // 1 automatic rework; more only when Mihai presses Rework

/**
 * Hard model-call budget (migration 0038). Every model call (Hermes, other LLM
 * providers, Jev) is charged here first; a call that would go over the cap for
 * the day (UTC) or for the running campaign is refused without reaching the
 * model. A provider usage limit (HTTP 429 "usage limit reached") trips a
 * breaker: no call is made until the limit resets.
 */

/** perDayUsd / perCampaignUsd: null = no limit (the default). Call counts are shown, never enforced. */
export type BudgetSettings = { perCampaignMax: number; perDayMax: number; perDayUsd: number | null; perCampaignUsd: number | null };

export type BudgetStatus = BudgetSettings & {
  /** Dollars (the caps that are enforced; Hermes calls cost $0). */
  usdToday: number;
  usdCampaign: number | null;
  remainingUsdToday: number | null;
  remainingUsdCampaign: number | null;
  /** Calls (shown, not enforced). */
  usedToday: number;
  remainingToday: number;
  usedCampaign: number | null;
  remainingCampaign: number | null;
  blockedUntil: string | null;
  blockReason: string | null;
};

export const DEFAULT_BUDGET: BudgetSettings = { perCampaignMax: 40, perDayMax: 150, perDayUsd: null, perCampaignUsd: null };

/**
 * Upper bounds per step (lean pipeline, Mihai 2026-11-20): one plan + one Jev review (1 automatic
 * rework); per platform one writer + one review (1 automatic rework) and, unless a library image is
 * used, one visual + one review (1 rework). Used for the call counts shown and, with STEP_AGENTS, for
 * the dollar preflight.
 */
export const CALL_ESTIMATE = {
  plan: 4, // Crina's plan + Jev, 1 automatic rework
  prepare: 0, // SEO + measurement are part of the plan now
  perPlatform: 2 * 2 + VISUAL_ROUNDS * 2, // writer + review (2 rounds max) + visual + review (2 rounds max)
  runOverhead: 1, // conversion analysis after a run
  rework: 3,
  // "Edit and approve": Mihai's text is used as is: only the visual + its review.
  approvedTextPlatform: VISUAL_ROUNDS * 2
};

/** Which agent makes each call of a step (so the dollar estimate uses that agent's model price). */
export type Step = { agentId: string; calls: number };
export const STEP_AGENTS = {
  plan: [{ agentId: "agent-crina", calls: 2 }, { agentId: "jev", calls: 2 }],
  perPlatform: [{ agentId: "agent-content-creator", calls: 2 }, { agentId: "agent-crina", calls: 2 + VISUAL_ROUNDS }, { agentId: "agent-visual-video", calls: VISUAL_ROUNDS }],
  runOverhead: [{ agentId: "agent-conversion", calls: 1 }],
  rework: [{ agentId: "agent-content-creator", calls: 1 }, { agentId: "agent-crina", calls: 1 }, { agentId: "agent-visual-video", calls: 1 }],
  approvedTextPlatform: [{ agentId: "agent-visual-video", calls: VISUAL_ROUNDS }, { agentId: "agent-crina", calls: VISUAL_ROUNDS }]
} satisfies Record<string, Step[]>;

/** Rough tokens per call for the estimate (the prompt diet keeps calls near this). */
export const EST_TOKENS_IN = 8000;
export const EST_TOKENS_OUT = 1200;

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
    perDayMax: Number(row?.per_day_max ?? DEFAULT_BUDGET.perDayMax),
    perDayUsd: row?.per_day_usd === null || row?.per_day_usd === undefined ? null : Number(row.per_day_usd),
    perCampaignUsd: row?.per_campaign_usd === null || row?.per_campaign_usd === undefined ? null : Number(row.per_campaign_usd)
  };
  const sum = (rows: Array<{ cost_usd?: number | string | null }> | null) => (rows ?? []).reduce((t, r) => t + Number(r.cost_usd ?? 0), 0);
  const { data: todayRows } = await supabase.from("model_calls").select("cost_usd").gte("at", dayStart()).limit(10000);
  const usedToday = todayRows?.length ?? 0;
  const usdToday = sum(todayRows as never);
  let usedCampaign: number | null = null;
  let usdCampaign: number | null = null;
  if (campaignId) {
    const { data } = await supabase.from("model_calls").select("cost_usd").eq("campaign_id", campaignId).limit(10000);
    usedCampaign = data?.length ?? 0;
    usdCampaign = sum(data as never);
  }
  const blockedUntil = row?.hermes_blocked_until && new Date(row.hermes_blocked_until).getTime() > Date.now() ? String(row.hermes_blocked_until) : null;
  return {
    ...settings,
    usdToday,
    usdCampaign,
    remainingUsdToday: settings.perDayUsd === null ? null : Math.max(0, settings.perDayUsd - usdToday),
    remainingUsdCampaign: usdCampaign === null || settings.perCampaignUsd === null ? null : Math.max(0, settings.perCampaignUsd - usdCampaign),
    usedToday: usedToday ?? 0,
    remainingToday: Math.max(0, settings.perDayMax - (usedToday ?? 0)),
    usedCampaign,
    remainingCampaign: usedCampaign === null ? null : Math.max(0, settings.perCampaignMax - usedCampaign),
    blockedUntil,
    blockReason: blockedUntil ? (row?.hermes_block_reason ?? null) : null
  };
}

/** Refuse a run up front if it could exceed the budget or a provider limit is active. Null = OK. */
export type ModelPrice = { provider: string; model: string; usd_per_m_in: number; usd_per_m_out: number; usd_per_call: number; verified: boolean; note: string };

let priceCache: { at: number; rows: ModelPrice[] } | null = null;

export async function listModelPrices(force = false): Promise<ModelPrice[]> {
  if (!force && priceCache && Date.now() - priceCache.at < 60_000) return priceCache.rows;
  const supabase = db();
  const rows = supabase ? (((await supabase.from("model_prices").select("*")).data ?? []) as ModelPrice[]) : [];
  priceCache = { at: Date.now(), rows: rows.map((r) => ({ ...r, usd_per_m_in: Number(r.usd_per_m_in), usd_per_m_out: Number(r.usd_per_m_out), usd_per_call: Number(r.usd_per_call) })) };
  return priceCache.rows;
}

/** Pure: the price row for provider/model: exact model, else the provider's "*", else "*"/"*", else $0. */
export function pickPrice(rows: ModelPrice[], provider: string, model: string | null | undefined): ModelPrice {
  const p = provider.startsWith("custom:") ? provider : provider.toLowerCase();
  return (
    rows.find((r) => r.provider === p && r.model === model) ??
    rows.find((r) => r.provider === p && r.model === "*") ??
    rows.find((r) => r.provider === "*" && r.model === "*") ?? { provider: p, model: "*", usd_per_m_in: 0, usd_per_m_out: 0, usd_per_call: 0, verified: false, note: "" }
  );
}

/** Pure: dollars for one call. */
export function costOf(price: Pick<ModelPrice, "usd_per_m_in" | "usd_per_m_out" | "usd_per_call">, tokensIn: number, tokensOut: number) {
  return price.usd_per_call + (Math.max(0, tokensIn) * price.usd_per_m_in + Math.max(0, tokensOut) * price.usd_per_m_out) / 1_000_000;
}

/** Dollars a step may cost: each call priced by the model its agent is set to (Agents board). */
export async function estimateUsd(steps: Step[]): Promise<number> {
  const prices = await listModelPrices();
  const { resolveAgentRuntimeConfig } = await import("@/lib/agents/agent-config-store");
  let total = 0;
  for (const step of steps) {
    const target = step.agentId === "jev" ? { provider: "jev", model: "*" } : await resolveAgentRuntimeConfig(step.agentId, "gpt-5.5").catch(() => ({ provider: "*", model: "*" }));
    total += step.calls * costOf(pickPrice(prices, target.provider, target.model), EST_TOKENS_IN, EST_TOKENS_OUT);
  }
  return total;
}

export const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

/** Refuse a step up front (plain words) when it could go over today's or this campaign's dollar budget. */
export async function preflight(campaignId: string | null, steps: Step[]): Promise<string | null> {
  const status = await getBudgetStatus(campaignId);
  if (!status) return null;
  if (status.blockedUntil) return limitMessage(status.blockedUntil);
  // No cap set (the default): never refuse; consumption is still counted and shown.
  if (status.remainingUsdToday === null && status.remainingUsdCampaign === null) return null;
  const need = await estimateUsd(steps);
  if (status.remainingUsdToday !== null && status.perDayUsd !== null && need > status.remainingUsdToday) {
    return `Model budget: this step may cost up to ${usd(need)} but only ${usd(status.remainingUsdToday)} of today's ${usd(status.perDayUsd)} cap is left (resets 00:00 UTC). Raise or clear the cap in Settings → Model budget, or wait.`;
  }
  if (status.remainingUsdCampaign !== null && status.perCampaignUsd !== null && need > status.remainingUsdCampaign) {
    return `Model budget: this campaign has ${usd(status.remainingUsdCampaign)} of its ${usd(status.perCampaignUsd)} cap left and this step may cost up to ${usd(need)}. Raise or clear the cap in Settings → Model budget.`;
  }
  return null;
}

/** Steps x count (e.g. per platform). */
export function times(steps: Step[], n: number): Step[] {
  return steps.map((step) => ({ ...step, calls: step.calls * n }));
}

/**
 * Charge one call before it is made: refused when today's or this campaign's dollar budget is used up.
 * Returns the row id so the caller can record the real tokens and cost afterwards (finishModelCall).
 */
export async function beginModelCall(kind: string, agentId: string | null = null, model: string | null = null): Promise<{ refused: string | null; id: string | null }> {
  const supabase = db();
  if (!supabase) return { refused: null, id: null }; // local mode: no shared budget store
  const campaignId = scope.getStore()?.campaignId ?? null;
  const status = await getBudgetStatus(campaignId);
  if (!status) return { refused: null, id: null };
  if (status.blockedUntil) return { refused: limitMessage(status.blockedUntil), id: null };
  if (status.remainingUsdToday !== null && status.perDayUsd !== null && status.remainingUsdToday <= 0) return { refused: `Today's model budget cap (${usd(status.perDayUsd)}) is used up; resets 00:00 UTC. Raise or clear the cap in Settings → Model budget.`, id: null };
  if (status.remainingUsdCampaign !== null && status.perCampaignUsd !== null && status.remainingUsdCampaign <= 0) return { refused: `This campaign's model budget cap (${usd(status.perCampaignUsd)}) is used up. Raise or clear the cap in Settings → Model budget.`, id: null };
  const perCall = pickPrice(await listModelPrices(), kind, model).usd_per_call;
  const { data } = await supabase.from("model_calls").insert({ at: new Date().toISOString(), campaign_id: campaignId, kind, agent_id: agentId, model, cost_usd: perCall }).select("id").single();
  return { refused: null, id: (data as { id?: string } | null)?.id ?? null };
}

/** After the answer: the real model and tokens -> cost. Never throws. */
export async function finishModelCall(id: string | null, usage: { provider: string; model: string | null; tokensIn: number | null; tokensOut: number | null }): Promise<void> {
  if (!id) return;
  try {
    const supabase = db();
    if (!supabase) return;
    const price = pickPrice(await listModelPrices(), usage.provider, usage.model);
    const cost = costOf(price, usage.tokensIn ?? 0, usage.tokensOut ?? 0);
    await supabase.from("model_calls").update({ model: usage.model, tokens_in: usage.tokensIn, tokens_out: usage.tokensOut, cost_usd: cost }).eq("id", id);
  } catch {
    // accounting must never break a call
  }
}

/** Compatibility: charge without recording usage afterwards. */
export async function chargeModelCall(kind: string, agentId: string | null = null): Promise<string | null> {
  return (await beginModelCall(kind, agentId)).refused;
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
  const { error } = await supabase.from("model_budget").upsert({ id: 1, per_campaign_max: settings.perCampaignMax, per_day_max: settings.perDayMax, per_day_usd: settings.perDayUsd, per_campaign_usd: settings.perCampaignUsd, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}
