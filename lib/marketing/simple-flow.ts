import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { jevCheck, jevLoop, type JevResult } from "@/lib/jev/jev";
import { defaultVault, learningContext } from "@/lib/learning/vault";
import type { Brand } from "@/lib/types";

/**
 * Mihai's simple flow (2026-11-20): he writes an idea -> Crina writes the plan
 * -> Jev checks it -> the agents work -> he reviews each part (Yes / Rework).
 * The flow's state lives in campaigns.idea_brief.
 */

export const FLOW_PLATFORMS = ["LinkedIn", "Instagram", "X", "Facebook", "TikTok", "Blog"] as const;

export type FlowStage = "planning" | "plan_doubts" | "plan_ready" | "agents" | "review" | "done";

export type CampaignPlan = {
  title: string;
  objective: string;
  target_audience: string;
  key_message: string;
  platforms: string[];
  cta: string;
  success_criteria: string;
  agent_tasks: { content: string; visual: string; seo: string; analytics: string };
  summary: string;
};

const planSchema = {
  title: "short campaign title (max 8 words)",
  objective: "one sentence: what this campaign must achieve",
  target_audience: "who it is for, from the brand profile and the idea",
  key_message: "the one message every post carries",
  platforms: ["platform names from: LinkedIn, Instagram, X, Facebook, TikTok, Blog"],
  cta: "the single call to action",
  success_criteria: "how we will know it worked (no invented numbers)",
  agent_tasks: { content: "one concrete task", visual: "one concrete task", seo: "one concrete task", analytics: "one concrete task" },
  summary: "two sentences Mihai can read in 10 seconds"
};

function str(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizePlan(value: unknown, fallbackPlatforms: string[]): CampaignPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const tasks = (raw.agent_tasks ?? {}) as Record<string, unknown>;
  const allowed = new Map(FLOW_PLATFORMS.map((p) => [p.toLowerCase(), p]));
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : [])
    .map((p) => allowed.get(String(p).toLowerCase().trim()))
    .filter((p): p is (typeof FLOW_PLATFORMS)[number] => Boolean(p));
  const plan: CampaignPlan = {
    title: str(raw.title),
    objective: str(raw.objective),
    target_audience: str(raw.target_audience),
    key_message: str(raw.key_message),
    platforms: fallbackPlatforms.length ? fallbackPlatforms : platforms.length ? Array.from(new Set(platforms)) : ["LinkedIn"],
    cta: str(raw.cta),
    success_criteria: str(raw.success_criteria),
    agent_tasks: { content: str(tasks.content), visual: str(tasks.visual), seo: str(tasks.seo), analytics: str(tasks.analytics) },
    summary: str(raw.summary)
  };
  return plan.title && plan.objective && plan.key_message ? plan : null;
}

export function cleanPlatforms(value: unknown): string[] {
  const allowed = new Map(FLOW_PLATFORMS.map((p) => [p.toLowerCase(), p]));
  return Array.isArray(value) ? Array.from(new Set(value.map((p) => allowed.get(String(p).toLowerCase())).filter((p): p is (typeof FLOW_PLATFORMS)[number] => Boolean(p)))) : [];
}

/** Crina turns Mihai's idea into a plan. `fixes` = Jev's doubts or Mihai's Rework reason. */
export async function makePlan(args: { idea: string; brand: Brand | null; platforms: string[]; learning: string; fixes: string[]; previous: CampaignPlan | null }) {
  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Turn Mihai's idea into a campaign plan",
    instructions: `Mihai wrote this campaign idea in his own words. Build ONE campaign plan that delivers exactly his idea, no more. Use the brand profile; never invent numbers or results. Give each working agent (content, visual, SEO, analytics) one concrete task.${args.platforms.length ? ` Use these platforms only: ${args.platforms.join(", ")}.` : " Pick at most 2 platforms that fit the idea."}\n\n${args.learning}${args.fixes.length ? `\n\nFix these before anything else:\n- ${args.fixes.join("\n- ")}` : ""}`,
    outputSchema: planSchema,
    input: { idea: args.idea, brand: args.brand, previous_plan: args.previous },
    brainFiles: ["workflow-contract.md", "approval-rules.md"],
    temperature: 0.4,
    routeOrigin: "api.marketing.campaigns.flow.plan"
  });
  return { plan: run.ok ? normalizePlan(run.json, args.platforms) : null, error: run.ok ? null : run.error ?? "Crina did not return a plan." };
}

export type PlanOutcome = {
  plan: CampaignPlan | null;
  jev: JevResult | null;
  doubts: string | null;
  reworks: number;
  stage: FlowStage;
  error: string | null;
};

/** Crina plans, Jev checks; below 0.85 Crina reworks (max 2), then it waits for Mihai with "Jev doubts". */
export async function planWithJev(args: { idea: string; brand: Brand | null; platforms: string[]; fixes?: string[]; previous?: CampaignPlan | null }): Promise<PlanOutcome> {
  const learning = (await learningContext(defaultVault(args.brand?.name), { part: "plan" })).text;
  const first = await makePlan({ idea: args.idea, brand: args.brand, platforms: args.platforms, learning, fixes: args.fixes ?? [], previous: args.previous ?? null });
  if (!first.plan) return { plan: null, jev: null, doubts: null, reworks: 0, stage: "planning", error: first.error };
  const checked = await jevLoop<CampaignPlan>(
    first.plan,
    (plan) => jevCheck({ kind: "plan", idea: args.idea, brand: args.brand, learning, subject: plan }),
    async (plan, doubts) => (await makePlan({ idea: args.idea, brand: args.brand, platforms: args.platforms, learning, fixes: doubts.map((d) => `Jev: ${d}`), previous: plan })).plan
  );
  return {
    plan: checked.candidate,
    jev: checked.result,
    doubts: checked.doubtsLabel,
    reworks: checked.reworks,
    stage: checked.doubtsLabel ? "plan_doubts" : "plan_ready",
    error: null
  };
}

/** SEO brief and analytics measurement note, run once the plan is cleared; stored in idea_brief for the makers. */
export async function prepareSupportAgents(args: { idea: string; brand: Brand | null; plan: CampaignPlan }) {
  const [seo, analytics] = await Promise.all([
    runMarketingAgentModel({
      agentId: "agent-seo",
      fallbackAgentName: "SEO Agent",
      fallbackRole: "Search",
      task: "SEO brief for the campaign",
      instructions: `Task from Crina's plan: ${args.plan.agent_tasks.seo || "give keywords and hashtags for the posts"}. Return search keywords and hashtags the posts should use, from the brand and the plan. No invented search volumes.`,
      outputSchema: { summary: "one sentence", keywords: ["3-6 keywords"], hashtags: ["3-6 hashtags"] },
      input: { idea: args.idea, plan: args.plan, brand: args.brand },
      temperature: 0.3,
      routeOrigin: "api.marketing.campaigns.flow.seo"
    }),
    runMarketingAgentModel({
      agentId: "agent-analytics",
      fallbackAgentName: "Analytics Agent",
      fallbackRole: "Measurement",
      task: "Measurement note for the campaign",
      instructions: `Task from Crina's plan: ${args.plan.agent_tasks.analytics || "say what to measure"}. Say what to track for this campaign and where, matching the success criteria. No invented numbers or targets.`,
      outputSchema: { summary: "one sentence", track: ["2-4 things to measure and where"] },
      input: { idea: args.idea, plan: args.plan, brand: args.brand },
      temperature: 0.3,
      routeOrigin: "api.marketing.campaigns.flow.analytics"
    })
  ]);
  return {
    seo: seo.ok ? (seo.json as Record<string, unknown>) : { summary: `SEO brief failed: ${seo.error ?? "no output"}` },
    analytics: analytics.ok ? (analytics.json as Record<string, unknown>) : { summary: `Measurement note failed: ${analytics.error ?? "no output"}` }
  };
}

export function jevSummary(jev: JevResult | null, doubts: string | null) {
  if (!jev) return null;
  return { ran: jev.ran, score: jev.score, doubts, note: jev.note };
}
