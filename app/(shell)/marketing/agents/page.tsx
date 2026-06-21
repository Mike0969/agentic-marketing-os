import { AgentsWorkspace, type AgentCardData } from "@/components/os/agents-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { readHermesRegistry } from "@/lib/agents/hermes-registry";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import type { Agent, AgentRun } from "@/lib/types";

export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function findRun(agent: Agent, agentId: string, runs: AgentRun[]) {
  return (
    runs.find((run) => run.agent_id === agentId) ??
    runs.find((run) => normalize(run.agent_name) === normalize(agent.name)) ??
    null
  );
}

function registryIdFor(agent: Agent, registry: Awaited<ReturnType<typeof readHermesRegistry>>) {
  const agents = registry.team?.agents ?? [];
  const direct = agents.find((profile) => normalize(profile.name) === normalize(agent.name));
  if (direct) return direct.id;

  const roleMatch = agents.find((profile) => normalize(profile.role) === normalize(agent.role));
  if (roleMatch) return roleMatch.id;

  if (agent.name.toLowerCase().includes("content")) return "agent-content-creator";
  if (agent.name.toLowerCase().includes("visual")) return "agent-visual-video";
  if (agent.name.toLowerCase().includes("competitor")) return "agent-competitor-intelligence";
  if (agent.name.toLowerCase().includes("publishing")) return "agent-publishing";
  if (agent.name.toLowerCase().includes("analytics")) return "agent-analytics";
  if (agent.name.toLowerCase().includes("seo")) return "agent-seo";
  if (agent.name.toLowerCase().includes("crina")) return "agent-crina";
  return agent.id;
}

export default async function AgentsPage() {
  const [data, registry, runs] = await Promise.all([getDashboardData(), readHermesRegistry(), getAgentRuns(undefined, 80)]);
  const profiles = registry.team?.agents ?? [];
  const cards: AgentCardData[] = data.agents.map((agent) => {
    const agentId = registryIdFor(agent, registry);
    const profile = profiles.find((item) => item.id === agentId) ?? null;
    const lastRun = findRun(agent, agentId, runs);
    return {
      dbId: agent.id,
      agentId,
      name: profile?.name ?? agent.name,
      role: profile?.role ?? agent.role,
      description: profile?.purpose || agent.description,
      model: profile?.default_model || agent.model_preference,
      supabaseStatus: agent.status,
      brandScope: agent.brand_scope,
      registryBacked: Boolean(profile),
      lastRunAt: lastRun?.created_at ?? null,
      lastRunStatus: lastRun?.status ?? null,
      lastRunWorkflow: lastRun?.workflow_name ?? null
    };
  });

  const fallback = cards.filter((card) => card.lastRunStatus === "fallback").length;
  const errors = cards.filter((card) => card.lastRunStatus === "error").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Agents"
        subtitle="Supabase roster merged with Hermes team registry and recent agent_runs observability. Test runs use the shared Hermes client only."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <OSMetric label="Agents" value={cards.length} hint="Supabase roster" />
        <OSMetric label="Registry backed" value={cards.filter((card) => card.registryBacked).length} hint="Found in team.json" />
        <OSMetric label="Fallback" value={fallback} hint="Last run used fallback" />
        <OSMetric label="Errors" value={errors} hint="Last run failed" />
      </div>
      <AgentsWorkspace agents={cards} />
    </>
  );
}
