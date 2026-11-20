import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { jevCheck, jevLoop, type JevResult } from "@/lib/jev/jev";
import { libraryContext } from "@/lib/learning/library";
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
  /** Lean pipeline: SEO and measurement are part of the plan (no separate SEO/Analytics calls). */
  seo_keywords?: string[];
  hashtags?: string[];
  measure?: string[];
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
  seo_keywords: ["3-6 search keywords the posts should use (no invented search volumes)"],
  hashtags: ["3-6 hashtags"],
  measure: ["2-4 things to track and where, matching the success criteria (no invented numbers)"],
  summary: "two sentences Mihai can read in 10 seconds"
};

function list(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, max) : [];
}

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
    seo_keywords: list(raw.seo_keywords, 6),
    hashtags: list(raw.hashtags, 6),
    measure: list(raw.measure, 4),
    summary: str(raw.summary)
  };
  return plan.title && plan.objective && plan.key_message ? plan : null;
}

export function cleanPlatforms(value: unknown): string[] {
  const allowed = new Map(FLOW_PLATFORMS.map((p) => [p.toLowerCase(), p]));
  return Array.isArray(value) ? Array.from(new Set(value.map((p) => allowed.get(String(p).toLowerCase())).filter((p): p is (typeof FLOW_PLATFORMS)[number] => Boolean(p)))) : [];
}

const lines = (v: string | null | undefined) => String(v ?? "").split(/\r?\n|;/).map((x) => x.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
const firstLine = (v: string | null | undefined) => lines(v)[0] ?? "";

/**
 * The plan from the brand + its templates, with NO model call (Mihai 2026-11-20: "template some parts;
 * only content and visual use imagination"). His idea + an optional note are passed to the writer as is.
 * Pure (tested).
 */
export function templatePlan(args: { idea: string; brand: Brand | null; platforms: string[]; note?: string | null }): CampaignPlan {
  const b = args.brand;
  const idea = args.idea.trim();
  const platforms = args.platforms.length ? args.platforms : ["Instagram"];
  const keywords = String(b?.seo_targets ?? "").split(/[,;\n]/).map((k) => k.trim()).filter(Boolean).slice(0, 6);
  const tagWords = String(b?.tpl_hashtags ?? "").split(/\s+/).filter((t) => t.startsWith("#"));
  const hashtags = (tagWords.length ? tagWords : keywords.map((k) => `#${k.replace(/[^\p{L}\p{N}]+/gu, "")}`)).slice(0, 6);
  const title = idea.split(/[.!?\n]/)[0].split(/\s+/).slice(0, 8).join(" ");
  return {
    title: title || "New campaign",
    objective: idea.slice(0, 300),
    target_audience: firstLine(b?.target_audience) || String(b?.target_audience ?? ""),
    key_message: firstLine(b?.key_messages) || firstLine(b?.positioning),
    platforms,
    cta: firstLine(b?.ctas ?? b?.reusable_ctas) || "Follow us",
    success_criteria: String(b?.tpl_success_criteria ?? "").trim() || "Every post approved by Mihai before it goes out.",
    agent_tasks: {
      content: `Write the ${platforms.join(" + ")} post(s) for: ${idea.slice(0, 200)}${args.note ? ` (Mihai's note: ${args.note})` : ""}`,
      visual: "Create the image freely, on-brand, for the post.",
      seo: keywords.join(", "),
      analytics: lines(b?.tpl_measure).join("; ")
    },
    seo_keywords: keywords,
    hashtags,
    measure: lines(b?.tpl_measure).slice(0, 4),
    summary: `From your idea and the ${b?.name ?? "brand"} templates: ${platforms.join(", ")}, CTA "${firstLine(b?.ctas ?? b?.reusable_ctas) || "Follow us"}". The writer and the visual agent take it from here.`
  };
}

/** Crina turns Mihai's idea into a plan. `fixes` = Jev's doubts or Mihai's Rework reason. */
export async function makePlan(args: { idea: string; brand: Brand | null; platforms: string[]; learning: string; fixes: string[]; previous: CampaignPlan | null }) {
  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Turn Mihai's idea into a campaign plan",
    instructions: `Mihai wrote this campaign idea in his own words. Build ONE campaign plan that delivers exactly his idea, no more. Use the brand profile; never invent numbers or results. Give each working agent (content, visual) one concrete task, and include the SEO keywords + hashtags the posts should use and what to measure (no invented numbers or search volumes).${args.platforms.length ? ` Use these platforms only: ${args.platforms.join(", ")}.` : " Pick at most 2 platforms that fit the idea."}\n\n${args.learning}${args.fixes.length ? `\n\nFix these before anything else:\n- ${args.fixes.join("\n- ")}` : ""}`,
    outputSchema: planSchema,
    input: { idea: args.idea, brand: brandVoice(args.brand), previous_plan: args.previous },
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

/** Crina plans, Jev checks; below 0.85 Crina reworks once, then it waits for Mihai with "Jev doubts". */
export async function planWithJev(args: { idea: string; brand: Brand | null; platforms: string[]; fixes?: string[]; previous?: CampaignPlan | null; campaignId?: string | null }): Promise<PlanOutcome> {
  const library = await libraryContext(args.brand?.id, `${args.idea} ${args.platforms.join(" ")}`, { part: "plan", campaignId: args.campaignId ?? null });
  const learning = [(await learningContext(defaultVault(args.brand?.name), { part: "plan" })).text, library].filter(Boolean).join("\n\n");
  const first = await makePlan({ idea: args.idea, brand: args.brand, platforms: args.platforms, learning, fixes: args.fixes ?? [], previous: args.previous ?? null });
  if (!first.plan) return { plan: null, jev: null, doubts: null, reworks: 0, stage: "planning", error: first.error };
  const checked = await jevLoop<CampaignPlan>(
    first.plan,
    (plan) => jevCheck({ kind: "plan", idea: args.idea, brand: args.brand, learning, subject: plan }),
    async (plan, doubts) => (await makePlan({ idea: args.idea, brand: args.brand, platforms: args.platforms, learning, fixes: doubts.map((d) => `Jev: ${d}`), previous: plan })).plan,
    1 // at most one automatic rework; more only when Mihai presses Rework
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
/** The brand fields an agent needs to write in its voice (prompt diet: not the whole brand row). */
export function brandVoice(brand: Brand | null) {
  return brand
    ? { name: brand.name, positioning: brand.positioning, target_audience: brand.target_audience, tone_of_voice: brand.tone_of_voice, key_messages: brand.key_messages ?? null, proof_points: brand.proof_points ?? null, approval_rules: brand.approval_rules ?? null, ctas: brand.ctas ?? brand.reusable_ctas ?? null }
    : null;
}

/**
 * After the plan is cleared. Lean pipeline: the SEO brief and the measurement note come from the plan
 * itself (no model calls). The shape stays { seo, analytics } for Review and the run.
 */
export async function prepareSupportAgents(args: { idea: string; brand: Brand | null; plan: CampaignPlan }) {
  const keywords = args.plan.seo_keywords ?? [];
  const hashtags = args.plan.hashtags ?? [];
  const track = args.plan.measure ?? [];
  return {
    seo: { summary: keywords.length || hashtags.length ? `Keywords: ${keywords.join(", ") || "none"}. Hashtags: ${hashtags.join(" ") || "none"}.` : "No SEO keywords in the plan.", keywords, hashtags },
    analytics: { summary: track.length ? `Track: ${track.join("; ")}.` : "Nothing to track named in the plan.", track }
  };
}

export function jevSummary(jev: JevResult | null, doubts: string | null) {
  if (!jev) return null;
  return { ran: jev.ran, score: jev.score, doubts, note: jev.note };
}
