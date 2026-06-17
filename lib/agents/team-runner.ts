import { recordAgentRun } from "@/lib/agents/agent-runs";
import { subAgentConfigs, teamFanOutKeys } from "@/lib/agents/agent-catalog";
import { resolveAgentModel } from "@/lib/agents/agent-config-store";
import { runHermesAgent } from "@/lib/agents/hermes-client";
import { listAgentTargets } from "@/lib/agents/agent-config-store";
import { runSubAgent, type SubAgentRunResult } from "@/lib/agents/sub-agent-runner";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import type { AgentRunStatus } from "@/lib/types";

const TEAM_REPORT_WORKFLOW = "Team Run Report";

/**
 * Parallel team run (fan-out / fan-in), the marketing version of the Hermes
 * "one role, many targets → synthesizer report" pattern.
 *
 * 1. Fan-out: the research/draft specialists run IN PARALLEL.
 * 2. Fan-in: Crina synthesizes their outputs into one weekly marketing report.
 *
 * Nothing here publishes. Publishing is draft-only and excluded from the
 * fan-out. The full structured report is returned as data/outputs for Hermes to
 * announce on Slack and to flag follow-ups on Telegram.
 */

const SYNTHESIZER_AGENT_ID = "agent-crina";
const SYNTHESIS_WORKFLOW = "Team Synthesis Report";

export type TeamRunInput = {
  brands?: string[];
  platforms?: string[];
  competitors?: string[];
  weekStartDate?: string | null;
  notes?: string;
};

export type AgentOutputSummary = {
  agentId: string;
  agentName: string;
  provider: "hermes" | "deterministic";
  fallback: boolean;
  durationMs: number;
  tokensTotal: number | null;
  model: string | null;
  output: Record<string, unknown>;
  error: string | null;
};

export type TeamRunReport = {
  generatedAt: string;
  weekStartDate: string | null;
  brandsCovered: string[];
  platforms: string[];
  competitors: string[];
  agentOutputs: AgentOutputSummary[];
  synthesis: Record<string, unknown> | null;
  synthesisProvider: "hermes" | "deterministic";
  observability: {
    totalDurationMs: number;
    totalTokens: number | null;
    successes: number;
    fallbacks: number;
    errors: number;
  };
  safety: { livePostingEnabled: false; note: string };
};

function toSummary(result: SubAgentRunResult): AgentOutputSummary {
  return {
    agentId: result.agentId,
    agentName: result.agent,
    provider: result.provider,
    fallback: result.fallback,
    durationMs: result.observability.durationMs,
    tokensTotal: result.observability.tokensTotal,
    model: result.observability.model,
    output: result.output,
    error: result.error
  };
}

export async function runTeam(input: TeamRunInput = {}): Promise<TeamRunReport> {
  const startedAt = Date.now();
  const data = await getDashboardData();
  const targets = await listAgentTargets();

  const activeBrands = data.brands.filter((brand) => brand.active);
  const brandsCovered = input.brands?.length ? input.brands : activeBrands.map((brand) => brand.name);

  const targetPlatforms = targets.filter((target) => target.type === "platform" && target.active).map((target) => target.label);
  const platforms = input.platforms?.length ? input.platforms : targetPlatforms.length ? targetPlatforms : ["LinkedIn", "X", "Blog"];

  const targetCompetitors = targets.filter((target) => target.type === "competitor" && target.active).map((target) => target.label);
  const competitors = input.competitors?.length ? input.competitors : targetCompetitors;

  const teamContext = {
    brands: brandsCovered,
    platforms,
    competitors,
    topics: targets.filter((target) => target.type === "topic" && target.active).map((target) => target.label),
    weekStartDate: input.weekStartDate ?? null,
    notes: input.notes ?? "",
    constraints: ["Never publish automatically.", "All output is idea/brief/draft only.", "Human approval is required before anything is scheduled."]
  };

  // 1. Fan-out — research/draft specialists run in parallel.
  const fanOutResults = await Promise.all(teamFanOutKeys.map((key) => runSubAgent(subAgentConfigs[key], teamContext)));
  const agentOutputs = fanOutResults.map(toSummary);

  // 2. Fan-in — Crina synthesizes the weekly marketing report.
  const synthesis = await synthesizeReport(agentOutputs, teamContext);

  const successes = agentOutputs.filter((output) => !output.fallback).length;
  const fallbacks = agentOutputs.filter((output) => output.fallback).length + (synthesis.provider === "deterministic" ? 1 : 0);
  const errors = agentOutputs.filter((output) => output.error && output.fallback).length;

  const tokenValues = [...agentOutputs.map((output) => output.tokensTotal), synthesis.tokensTotal].filter((value): value is number => value != null);
  const totalTokens = tokenValues.length ? tokenValues.reduce((sum, value) => sum + value, 0) : null;

  const report: TeamRunReport = {
    generatedAt: new Date().toISOString(),
    weekStartDate: input.weekStartDate ?? null,
    brandsCovered,
    platforms,
    competitors,
    agentOutputs,
    synthesis: synthesis.report,
    synthesisProvider: synthesis.provider,
    observability: {
      totalDurationMs: Date.now() - startedAt,
      totalTokens,
      successes,
      fallbacks,
      errors
    },
    safety: { livePostingEnabled: false, note: "Team run is read/draft only. Live posting is disabled and no content was published." }
  };

  // Persist the full report so /api/agents/team/report can return the latest one
  // for Hermes to announce on Slack.
  const status: AgentRunStatus = errors ? "error" : synthesis.provider === "deterministic" || fallbacks ? "fallback" : "success";
  await recordAgentRun({
    agentName: "Team",
    agentId: "team",
    workflowName: TEAM_REPORT_WORKFLOW,
    provider: synthesis.provider,
    status,
    input: { brandsCovered, platforms, competitors } as Record<string, unknown>,
    output: report as unknown as Record<string, unknown>,
    error: null,
    durationMs: report.observability.totalDurationMs,
    tokensTotal: report.observability.totalTokens,
    handoffFrom: "Team fan-out",
    handoffTo: "Slack report"
  });

  return report;
}

/** Latest persisted team report (for the GET /report endpoint). */
export async function getLatestTeamReport(): Promise<TeamRunReport | null> {
  const runs = await getAgentRuns("Team", 10);
  const latest = runs.find((run) => run.workflow_name === TEAM_REPORT_WORKFLOW);
  return (latest?.output as unknown as TeamRunReport) ?? null;
}

async function synthesizeReport(agentOutputs: AgentOutputSummary[], teamContext: Record<string, unknown>) {
  const startedAt = Date.now();
  const outputSchema = {
    headline: "string",
    executiveSummary: "string",
    keyMoves: ["string"],
    perBrand: [{ brand: "string", focus: "string", recommendedPosts: "number" }],
    risks: ["string"],
    nextActions: ["string"]
  };

  const result = await runHermesAgent({
    agentId: SYNTHESIZER_AGENT_ID,
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: SYNTHESIS_WORKFLOW,
    instructions:
      "Read every specialist agent output and synthesize ONE concise executive weekly marketing report. Take a position. Do not publish, schedule, or approve anything.",
    outputSchema,
    input: { teamContext, agentOutputs },
    handoffFrom: "Team fan-out",
    handoffTo: "Approval Queue / Slack report"
  });

  if (result.ok && result.json && typeof result.json === "object") {
    const report = result.json as Record<string, unknown>;
    await recordAgentRun({
      agentName: "Crina",
      agentId: SYNTHESIZER_AGENT_ID,
      workflowName: SYNTHESIS_WORKFLOW,
      provider: "hermes",
      status: "success",
      input: { teamContext } as Record<string, unknown>,
      output: report,
      error: null,
      model: result.modelUsed,
      backupModel: result.backupModel,
      tokensPrompt: result.usage.tokensPrompt,
      tokensCompletion: result.usage.tokensCompletion,
      tokensTotal: result.usage.tokensTotal,
      durationMs: result.durationMs,
      brainResourcesUsed: result.brainResourcesUsed,
      handoffFrom: "Team fan-out",
      handoffTo: "Approval Queue / Slack report",
      providerResponseStatus: result.status
    });
    return { report, provider: "hermes" as const, tokensTotal: result.usage.tokensTotal };
  }

  // Deterministic synthesis fallback.
  const report = buildDeterministicReport(agentOutputs);
  const fallbackModel = await resolveAgentModel(SYNTHESIZER_AGENT_ID, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
  await recordAgentRun({
    agentName: "Crina",
    agentId: SYNTHESIZER_AGENT_ID,
    workflowName: SYNTHESIS_WORKFLOW,
    provider: "deterministic",
    status: "fallback",
    input: { teamContext } as Record<string, unknown>,
    output: report,
    error: result.error,
    model: fallbackModel,
    backupModel: result.backupModel,
    durationMs: Date.now() - startedAt,
    brainResourcesUsed: result.brainResourcesUsed,
    handoffFrom: "Team fan-out",
    handoffTo: "Approval Queue / Slack report",
    providerResponseStatus: result.status
  });
  return { report, provider: "deterministic" as const, tokensTotal: null };
}

function buildDeterministicReport(agentOutputs: AgentOutputSummary[]): Record<string, unknown> {
  const ran = agentOutputs.map((output) => output.agentName).join(", ");
  return {
    headline: "Weekly marketing report (deterministic fallback)",
    executiveSummary: `Hermes synthesis was unavailable. ${agentOutputs.length} specialist agents ran (${ran}). Outputs are attached for manual review. No content was published.`,
    keyMoves: agentOutputs.filter((output) => !output.fallback).map((output) => `${output.agentName} produced live output.`),
    perBrand: [],
    risks: ["Hermes synthesis unavailable — report is a structural fallback.", ...agentOutputs.filter((output) => output.fallback).map((output) => `${output.agentName} used deterministic fallback.`)],
    nextActions: ["Connect Hermes for a real synthesized report.", "Review specialist outputs in the approval queue."]
  };
}
