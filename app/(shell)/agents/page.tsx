import { AgentKanbanBoard, type AgentKanbanCard, type AgentKanbanRun } from "@/components/os/agent-kanban-board";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { listAgentConfigs, resolveAgentRuntimeConfig } from "@/lib/agents/agent-config-store";
import { readHermesRegistry } from "@/lib/agents/hermes-registry";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { getProvider, isConfigured, PROVIDERS } from "@/lib/providers";
import type { Agent, AgentRun, AgentRunStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const domainByAgent: Record<string, AgentKanbanCard["domain"]> = {
  "agent-crina": "Marketing",
  "agent-seo": "Marketing",
  "agent-content-creator": "Marketing",
  "agent-visual-video": "Marketing",
  "agent-competitor-intelligence": "Marketing",
  "agent-publishing": "Marketing",
  "agent-analytics": "Marketing",
  "agent-fx-scanner": "Trading",
  "agent-quant-lab": "Trading",
  "agent-risk-governor": "Trading",
  "agent-founder-operator": "Founder"
};

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function registryIdFor(agent: Agent, registryIds: string[], namesById: Map<string, string>) {
  const direct = registryIds.find((id) => normalize(namesById.get(id) ?? "") === normalize(agent.name));
  if (direct) return direct;
  if (agent.name.toLowerCase().includes("content")) return "agent-content-creator";
  if (agent.name.toLowerCase().includes("visual")) return "agent-visual-video";
  if (agent.name.toLowerCase().includes("competitor")) return "agent-competitor-intelligence";
  if (agent.name.toLowerCase().includes("publishing")) return "agent-publishing";
  if (agent.name.toLowerCase().includes("analytics")) return "agent-analytics";
  if (agent.name.toLowerCase().includes("seo")) return "agent-seo";
  if (agent.name.toLowerCase().includes("crina")) return "agent-crina";
  return agent.id;
}

function summaryFromRun(run: AgentRun | null) {
  if (!run) return null;
  if (run.error) return run.error.slice(0, 100);
  const output = run.output;
  if (!output) return null;
  const candidate = output.statusSummary ?? output.response ?? output.nextAction ?? output.summary ?? JSON.stringify(output);
  return String(candidate).slice(0, 100);
}

function columnFromRun(status: AgentRunStatus | null): AgentKanbanCard["column"] {
  if (!status) return "idle";
  if (status === "error") return "error";
  return "done";
}

function runLog(run: AgentRun): AgentKanbanRun {
  return {
    id: run.id,
    workflowName: run.workflow_name,
    provider: run.provider,
    model: run.model ?? null,
    status: run.status,
    summary: summaryFromRun(run) ?? "No output summary.",
    createdAt: run.created_at,
    durationMs: run.duration_ms ?? null,
    error: run.error
  };
}

async function getModelOptions() {
  const providers = PROVIDERS.filter((provider) => provider.kind === "model" && isConfigured(provider.key));
  const results = await Promise.all(
    providers.map(async (provider) => {
      const providerModule = getProvider(provider.key);
      const result = await providerModule.listModels();
      return result.models.map((model) => ({ provider: provider.key, providerLabel: provider.label, model: model.id, label: model.label }));
    })
  );
  return results.flat();
}

export default async function AgentsKanbanPage() {
  const [data, registry, runs, configs, modelOptions] = await Promise.all([
    getDashboardData(),
    readHermesRegistry(),
    getAgentRuns(undefined, 200),
    listAgentConfigs(),
    getModelOptions()
  ]);

  const profiles = registry.team?.agents ?? [];
  const namesById = new Map(profiles.map((profile) => [profile.id, profile.name]));
  const registryIds = profiles.map((profile) => profile.id);
  const seen = new Set<string>();

  const baseAgents = data.agents.map((agent) => {
    const agentId = registryIdFor(agent, registryIds, namesById);
    seen.add(agentId);
    const profile = profiles.find((item) => item.id === agentId);
    return { agentId, name: profile?.name ?? agent.name };
  });

  for (const profile of profiles) {
    if (!seen.has(profile.id)) baseAgents.push({ agentId: profile.id, name: profile.name });
  }

  const cards: AgentKanbanCard[] = await Promise.all(
    baseAgents.map(async (agent) => {
      const agentRuns = runs.filter((run) => run.agent_id === agent.agentId || normalize(run.agent_name) === normalize(agent.name));
      const latest = agentRuns[0] ?? null;
      const runtime = await resolveAgentRuntimeConfig(agent.agentId, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
      const config = configs.find((item) => item.agent_id === agent.agentId);
      return {
        agentId: agent.agentId,
        name: agent.name,
        domain: domainByAgent[agent.agentId] ?? "Marketing",
        provider: config?.provider ?? runtime.provider,
        model: config?.model ?? runtime.model,
        column: columnFromRun(latest?.status ?? null),
        lastRunAt: latest?.created_at ?? null,
        lastRunStatus: latest?.status ?? null,
        lastRunSummary: summaryFromRun(latest),
        logs: agentRuns.slice(0, 10).map(runLog)
      };
    })
  );

  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Agents"
        subtitle="Cross-domain operating board. Run smoke checks, switch model assignments, and inspect recent agent_runs without exposing provider secrets."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <OSMetric label="Agents" value={cards.length} hint="Registry + Supabase roster" />
        <OSMetric label="Done" value={cards.filter((card) => card.column === "done").length} hint="Last run succeeded or fallback" />
        <OSMetric label="Error" value={cards.filter((card) => card.column === "error").length} hint="Last run failed" />
        <OSMetric label="Model options" value={modelOptions.length} hint="Configured providers only" />
      </div>
      <AgentKanbanBoard initialCards={cards} providers={PROVIDERS} modelOptions={modelOptions} />
    </>
  );
}
