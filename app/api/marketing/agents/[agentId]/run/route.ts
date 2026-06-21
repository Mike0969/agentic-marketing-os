import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runHermesAgent } from "@/lib/agents/hermes-client";
import { getHermesAgentProfile } from "@/lib/agents/hermes-registry";
import { getDashboardData } from "@/lib/data";

type AgentTestOutput = {
  statusSummary: string;
  nextAction: string;
  safetyNote: string;
};

const outputSchema = {
  statusSummary: "One sentence confirming what the agent can do in the Marketing OS.",
  nextAction: "One practical next action this agent recommends.",
  safetyNote: "One sentence acknowledging no live posting/publishing without human approval."
};

function normalizeOutput(value: unknown): AgentTestOutput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const statusSummary = typeof raw.statusSummary === "string" ? raw.statusSummary : "";
  const nextAction = typeof raw.nextAction === "string" ? raw.nextAction : "";
  const safetyNote = typeof raw.safetyNote === "string" ? raw.safetyNote : "";
  if (!statusSummary || !nextAction || !safetyNote) return null;
  return { statusSummary, nextAction, safetyNote };
}

function fallbackOutput(agentName: string, reason: string): AgentTestOutput {
  return {
    statusSummary: `${agentName} did not receive a usable Hermes response, so the OS used deterministic fallback output.`,
    nextAction: "Check Hermes health/model routing, then run the agent again before trusting output quality.",
    safetyNote: `FALLBACK: ${reason}. No live posting or publishing was performed.`
  };
}

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { agentId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fallbackAgentName = typeof body?.agentName === "string" ? body.agentName : "Marketing Agent";
  const fallbackRole = typeof body?.role === "string" ? body.role : "Marketing OS specialist";
  const profile = await getHermesAgentProfile(agentId);
  const data = await getDashboardData();
  const agentName = profile?.name ?? fallbackAgentName;

  const result = await runHermesAgent({
    agentId,
    fallbackAgentName,
    fallbackRole,
    task: "Marketing Agent Health Check",
    instructions:
      "Run a minimal readiness check for this agent. Do not create production content. Do not post, schedule, or publish. Return compact operational JSON only.",
    outputSchema,
    input: {
      agentId,
      agentName,
      brands: data.brands.map((brand) => ({
        name: brand.name,
        positioning: brand.positioning,
        pillars: brand.pillars ?? brand.content_pillars,
        seoTargets: brand.seo_targets,
        ctas: brand.ctas ?? brand.reusable_ctas,
        approvalRules: brand.approval_rules
      })),
      openCampaigns: data.campaigns.filter((campaign) => campaign.status !== "completed").map((campaign) => ({ title: campaign.title, status: campaign.status }))
    },
    brainFiles: ["workflow-contract.md", "token-model-policy.md", "draft-publishing-safety.md"],
    temperature: 0.2
  });

  const hermesOutput = normalizeOutput(result.json);
  const fallback = !result.ok || !hermesOutput;
  const output = fallback ? fallbackOutput(agentName, result.error ?? "Hermes returned invalid JSON.") : hermesOutput;
  const provider = fallback ? "deterministic" : "hermes";
  const error = fallback ? result.error ?? "Hermes returned invalid health-check JSON." : null;

  await recordAgentRun({
    agentName,
    agentId,
    workflowName: "Marketing Agent Health Check",
    provider,
    status: fallback ? "fallback" : "success",
    input: { agentId, agentName },
    output: output as unknown as Record<string, unknown>,
    error,
    model: result.modelUsed,
    backupModel: result.backupModel,
    tokensPrompt: result.usage.tokensPrompt,
    tokensCompletion: result.usage.tokensCompletion,
    tokensTotal: result.usage.tokensTotal,
    durationMs: result.durationMs,
    brainResourcesUsed: result.brainResourcesUsed,
    providerResponseStatus: result.status
  });

  return NextResponse.json({ output, fallback, provider, error });
}
