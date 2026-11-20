import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { resolveAgentRuntimeConfig } from "@/lib/agents/agent-config-store";
import { boardTasks, missingKey } from "@/lib/agents/board-tasks";
import { getHermesAgentProfile } from "@/lib/agents/hermes-registry";
import { getRegisteredAgent } from "@/lib/agents/registry";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { callModel } from "@/lib/providers/call-model";
import type { AgentRunStatus } from "@/lib/types";

export const runtime = "nodejs";
// Real agent jobs through Hermes can take a few minutes.
export const maxDuration = 300;

function summarize(value: unknown, error: string | null) {
  if (error) return error.slice(0, 180);
  if (typeof value === "string") return value.slice(0, 180);
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const candidate = raw.summary ?? raw.statusSummary ?? raw.response ?? raw.nextAction ?? JSON.stringify(value);
    return String(candidate).slice(0, 180);
  }
  return "Agent run completed.";
}

export async function POST(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { agentId } = await context.params;
  const task = boardTasks[agentId];
  if (!task) return NextResponse.json({ ok: false, status: "error", error: `No board job is defined for agent ${agentId}.` }, { status: 404 });

  const profile = await getHermesAgentProfile(agentId);
  const runtimeConfig = await resolveAgentRuntimeConfig(agentId, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
  const agentName = profile?.name ?? getRegisteredAgent(agentId)?.name ?? agentId;
  const role = profile?.role ?? getRegisteredAgent(agentId)?.description ?? "Agentic OS agent";

  const [data, recentRuns] = await Promise.all([getDashboardData(), getAgentRuns(undefined, 50)]);
  const input = task.input({ brands: data.brands, campaigns: data.campaigns, contentItems: data.contentItems, recentRuns });

  const startedAt = Date.now();
  const result = await callModel({
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    agentId,
    fallbackAgentName: agentName,
    fallbackRole: role,
    task: task.task,
    system: task.instructions,
    user: JSON.stringify({ task: task.task, instructions: task.instructions, outputSchema: task.outputSchema, input }),
    hermesInput: input,
    hermesInstructions: task.instructions,
    jsonSchema: task.outputSchema,
    temperature: 0.4
  });

  const needsKey = result.ok ? missingKey(task) : null;
  const status: AgentRunStatus = !result.ok ? (result.rateLimited ? "rate_limited" : "error") : needsKey ? "needs_key" : "success";
  let outputSummary = summarize(result.json ?? result.text, result.error);
  if (result.ok && task.summaryPrefix) outputSummary = `${task.summaryPrefix}: ${outputSummary}`.slice(0, 180);
  if (needsKey) outputSummary = `Needs ${needsKey} to render. Concept ready: ${outputSummary}`.slice(0, 240);

  const output: Record<string, unknown> =
    result.json && typeof result.json === "object" ? { ...(result.json as Record<string, unknown>) } : { response: result.text ?? outputSummary };
  if (result.ok) output.summary = outputSummary;
  if (task.summaryPrefix) output.posted = false;
  if (needsKey) output.needs_key = needsKey;

  await recordAgentRun({
    agentName,
    agentId,
    workflowName: task.task,
    provider: runtimeConfig.provider,
    status,
    input: { agentId, agentName, provider: runtimeConfig.provider, model: runtimeConfig.model, task: task.task },
    output,
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
    workflowName: task.task,
    outputSummary,
    durationMs: result.latencyMs || Date.now() - startedAt,
    error: result.error
  });
}
