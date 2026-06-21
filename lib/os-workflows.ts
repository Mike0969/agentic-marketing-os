import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runHermesAgent } from "@/lib/agents/hermes-client";

export type OsWorkflowKey =
  | "fx-scanner"
  | "quant-lab"
  | "risk-governor"
  | "founder-brief"
  | "founder-decisions";

export type OsWorkflowResult = {
  workflow: OsWorkflowKey;
  title: string;
  provider: "hermes" | "deterministic";
  fallback: boolean;
  status: "success" | "fallback";
  output: Record<string, unknown>;
  error: string | null;
  safety: string;
};

type OsWorkflowConfig = {
  agentId: string;
  agentName: string;
  role: string;
  title: string;
  task: string;
  instructions: string;
  outputSchema: Record<string, unknown>;
  fallback: (input: Record<string, unknown>) => Record<string, unknown>;
  safety: string;
};

const configs: Record<OsWorkflowKey, OsWorkflowConfig> = {
  "fx-scanner": {
    agentId: "agent-trading-fx-scanner",
    agentName: "FX Scanner Agent",
    role: "Trading Research Agent",
    title: "FX Scanner",
    task: "Scan FX watchlist",
    instructions:
      "Analyze the supplied FX watchlist as research only. Identify market structure, momentum, levels, risks, and watch conditions. Never place or recommend immediate broker execution. Return strict JSON.",
    outputSchema: {
      marketRegime: "string",
      topSetups: [{ pair: "string", bias: "long | short | neutral", confidence: "low | medium | high", trigger: "string", invalidation: "string", notes: "string" }],
      riskWarnings: ["string"],
      nextRefresh: "string",
      comingSoon: ["broker execution", "live pricing feed"]
    },
    fallback: () => ({
      marketRegime: "COMING SOON live regime feed. Fallback scanner is using static watchlist context.",
      topSetups: [
        { pair: "EUR/USD", bias: "neutral", confidence: "low", trigger: "Wait for confirmed breakout/retest.", invalidation: "No live price feed connected.", notes: "COMING SOON: live candles and broker data." },
        { pair: "GBP/USD", bias: "neutral", confidence: "low", trigger: "Monitor London/New York overlap.", invalidation: "No live price feed connected.", notes: "Fallback research only." }
      ],
      riskWarnings: ["COMING SOON: real-time spread, volatility, and session filters.", "No order execution is connected."],
      nextRefresh: "Manual refresh",
      comingSoon: ["live market data", "broker execution", "economic calendar"]
    }),
    safety: "Research only. No broker execution."
  },
  "quant-lab": {
    agentId: "agent-trading-quant-lab",
    agentName: "Quant Lab Agent",
    role: "Strategy Research Agent",
    title: "Quant Lab",
    task: "Evaluate strategy hypothesis",
    instructions:
      "Evaluate the supplied trading hypothesis. Produce a research plan, test assumptions, features, edge risks, and validation gates. Never claim profitability without real backtest evidence.",
    outputSchema: {
      hypothesis: "string",
      researchPlan: ["string"],
      features: ["string"],
      validationGates: ["string"],
      failureModes: ["string"],
      comingSoon: ["string"]
    },
    fallback: (input) => ({
      hypothesis: String(input.hypothesis || "Session momentum continuation with volatility filter"),
      researchPlan: ["Define entry/exit rules", "Backtest by pair and session", "Walk-forward test", "Paper trade before any live use"],
      features: ["Session", "ATR regime", "trend slope", "spread filter"],
      validationGates: ["Minimum 200 trades", "Out-of-sample stability", "Max drawdown threshold", "No look-ahead bias"],
      failureModes: ["Overfitting", "News spikes", "Execution slippage", "Regime shift"],
      comingSoon: ["historical data loader", "backtest engine", "walk-forward optimizer"]
    }),
    safety: "Research only. No investment advice and no live orders."
  },
  "risk-governor": {
    agentId: "agent-trading-risk-governor",
    agentName: "Risk Governor Agent",
    role: "Risk Control Agent",
    title: "Risk Governor",
    task: "Review portfolio risk",
    instructions:
      "Review the supplied risk snapshot. Flag exposure, drawdown, concentration, and operational risk. Never approve live trading. Return strict JSON with risk actions.",
    outputSchema: {
      riskState: "green | amber | red",
      exposureNotes: ["string"],
      guardrails: ["string"],
      requiredHumanActions: ["string"],
      comingSoon: ["string"]
    },
    fallback: () => ({
      riskState: "amber",
      exposureNotes: ["COMING SOON: broker positions are not connected.", "Use this as a risk checklist until live read-only data exists."],
      guardrails: ["Define daily loss stop", "Define max correlated FX exposure", "Block trading around high-impact news until calendar integration exists"],
      requiredHumanActions: ["Connect broker read-only API before trusting exposure numbers", "Set account-level drawdown limits"],
      comingSoon: ["broker read-only sync", "real-time margin", "kill switch workflow"]
    }),
    safety: "Risk review only. No trading authority."
  },
  "founder-brief": {
    agentId: "agent-founder-chief-of-staff",
    agentName: "Founder Chief of Staff Agent",
    role: "Founder Ops Agent",
    title: "Founder Daily Brief",
    task: "Generate founder operating brief",
    instructions:
      "Create a concise founder operating brief across marketing, trading research, product, fundraising, and follow-ups. Focus on decisions, blocked items, and next best actions.",
    outputSchema: {
      headline: "string",
      priorities: ["string"],
      decisionsNeeded: ["string"],
      risks: ["string"],
      followUps: ["string"],
      comingSoon: ["string"]
    },
    fallback: () => ({
      headline: "Founder Ops fallback brief",
      priorities: ["Review marketing approvals", "Confirm next connector priority", "Decide whether trading remains research-only this sprint"],
      decisionsNeeded: ["Choose first real trading data provider", "Choose image/video provider budget", "Confirm deployment target"],
      risks: ["Too many workflows without production-grade credentials", "Manual Supabase SQL drift"],
      followUps: ["Run Marketing OS approval queue", "Check Search Console connector", "Add service role key server-side"],
      comingSoon: ["calendar/email ingestion", "CRM/investor pipeline sync", "Slack/Telegram daily delivery"]
    }),
    safety: "Decision support only."
  },
  "founder-decisions": {
    agentId: "agent-founder-decision-register",
    agentName: "Decision Register Agent",
    role: "Founder Governance Agent",
    title: "Decision Register",
    task: "Structure founder decision register",
    instructions:
      "Turn founder notes into a decision register with owner, urgency, options, recommendation, and blocked dependencies. Do not execute decisions.",
    outputSchema: {
      decisions: [{ title: "string", urgency: "low | medium | high", owner: "string", options: ["string"], recommendation: "string", dependencies: ["string"] }],
      operatingRules: ["string"],
      comingSoon: ["string"]
    },
    fallback: () => ({
      decisions: [
        {
          title: "Deploy Agentic OS",
          urgency: "high",
          owner: "Founder",
          options: ["Vercel + Supabase", "Dedicated VPS"],
          recommendation: "Use Vercel for app and Supabase for managed DB/auth first.",
          dependencies: ["Set server-only secrets", "Confirm domain", "Run migrations"]
        }
      ],
      operatingRules: ["No live posting/trading without explicit final safety gate", "Every agent output needs visible owner/status"],
      comingSoon: ["persistent decision table", "calendar reminders", "advisor sharing portal"]
    }),
    safety: "Governance support only."
  }
};

export function getOsWorkflowConfig(workflow: OsWorkflowKey) {
  return configs[workflow];
}

export async function runOsWorkflow(workflow: OsWorkflowKey, input: Record<string, unknown> = {}): Promise<OsWorkflowResult> {
  const config = configs[workflow];
  const result = await runHermesAgent({
    agentId: config.agentId,
    fallbackAgentName: config.agentName,
    fallbackRole: config.role,
    task: config.task,
    instructions: `${config.instructions} Safety: ${config.safety}. Label unimplemented integrations as COMING SOON.`,
    outputSchema: config.outputSchema,
    input,
    temperature: 0.25
  });

  const provider = result.ok && result.json && typeof result.json === "object" ? "hermes" : "deterministic";
  const output = provider === "hermes" ? (result.json as Record<string, unknown>) : config.fallback(input);
  const fallback = provider === "deterministic";

  await recordAgentRun({
    agentName: config.agentName,
    agentId: config.agentId,
    workflowName: config.task,
    provider,
    status: fallback ? "fallback" : "success",
    input,
    output,
    error: result.error,
    model: result.modelUsed,
    backupModel: result.backupModel,
    tokensPrompt: result.usage.tokensPrompt,
    tokensCompletion: result.usage.tokensCompletion,
    tokensTotal: result.usage.tokensTotal,
    durationMs: result.durationMs,
    brainResourcesUsed: result.brainResourcesUsed,
    providerResponseStatus: result.status
  });

  return {
    workflow,
    title: config.title,
    provider,
    fallback,
    status: fallback ? "fallback" : "success",
    output,
    error: fallback ? result.error : null,
    safety: config.safety
  };
}
