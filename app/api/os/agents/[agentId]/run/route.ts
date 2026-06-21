import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { resolveAgentRuntimeConfig } from "@/lib/agents/agent-config-store";
import { getHermesAgentProfile } from "@/lib/agents/hermes-registry";
import { callModel } from "@/lib/providers/call-model";

export const runtime = "nodejs";

const outputSchema = {
  statusSummary: "One sentence confirming the agent is reachable.",
  nextAction: "One safe next step.",
  safetyNote: "One sentence confirming no live publishing, trading, or irreversible action."
};

function summarize(value: unknown, error: string | null) {
  if (error) return error.slice(0, 180);
  if (typeof value === "string") return value.slice(0, 180);
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const candidate = raw.statusSummary ?? raw.response ?? raw.nextAction ?? JSON.stringify(value);
    return String(candidate).slice(0, 180);
  }
  return "Agent smoke run completed.";
}

export async function POST(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { agentId } = await context.params;
  const profile = await getHermesAgentProfile(agentId);
  const runtimeConfig = await resolveAgentRuntimeConfig(agentId, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
  const agentName = profile?.name ?? agentId;
  const role = profile?.role ?? "Agentic OS agent";

  const startedAt = Date.now();
  const result = await callModel({
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    agentId,
    fallbackAgentName: agentName,
    fallbackRole: role,
    task: "OS Agent Smoke Run",
    system:
      "You are running a minimal OS readiness check. Do not create production content, publish, schedule, trade, browse, or take external side effects. Return compact JSON.",
    user: JSON.stringify({ agentId, agentName, role, expectedOutput: outputSchema }),
    jsonSchema: outputSchema,
    temperature: 0.1
  });

  const status = result.ok ? "success" : "error";
  const outputSummary = summarize(result.json ?? result.text, result.error);

  await recordAgentRun({
    agentName,
    agentId,
    workflowName: "OS Agent Smoke Run",
    provider: runtimeConfig.provider,
    status,
    input: { agentId, agentName, provider: runtimeConfig.provider, model: runtimeConfig.model },
    output: result.json && typeof result.json === "object" ? (result.json as Record<string, unknown>) : { response: result.text ?? outputSummary },
    error: result.error,
    model: result.model,
    tokensPrompt: result.usage?.promptTokens ?? null,
    tokensCompletion: result.usage?.completionTokens ?? null,
    tokensTotal: result.usage?.totalTokens ?? null,
    durationMs: result.latencyMs || Date.now() - startedAt,
    providerResponseStatus: result.status
  });

  return NextResponse.json({
    ok: result.ok,
    status,
    provider: runtimeConfig.provider,
    model: result.model,
    outputSummary,
    durationMs: result.latencyMs || Date.now() - startedAt,
    error: result.error
  });
}
