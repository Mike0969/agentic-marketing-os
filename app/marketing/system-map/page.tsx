import { BrainCircuit, FileText, Layers, Network } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { readHermesRegistry } from "@/lib/agents/hermes-registry";
import { getAgentStatus } from "@/lib/agents/agent-status";
import { LiveBrain } from "@/components/live-brain";

export const dynamic = "force-dynamic";

type Cluster = "orchestration" | "intelligence" | "content" | "ops";

const clusterOf: Record<string, Cluster> = {
  "agent-crina": "orchestration",
  "agent-seo": "intelligence",
  "agent-competitor-intelligence": "intelligence",
  "agent-content-creator": "content",
  "agent-visual-video": "content",
  "agent-publishing": "ops",
  "agent-analytics": "ops"
};

const clusterColor: Record<Cluster, string> = {
  orchestration: "#6366f1",
  intelligence: "#2563eb",
  content: "#059669",
  ops: "#d97706"
};

const clusterLabel: Record<Cluster, string> = {
  orchestration: "Orchestration",
  intelligence: "Intelligence",
  content: "Content",
  ops: "Operations"
};

export default async function SystemMapPage() {
  const [registry, status] = await Promise.all([readHermesRegistry(), getAgentStatus()]);
  const agents = registry.team?.agents ?? [];
  const brain = registry.brainResources;

  return (
    <>
      <PageHeader
        eyebrow="Live Brain"
        title="Agentic Control Room"
        description="A living, clickable map of the agent team. Nodes pulse with real state, raise signals when they hit issues, and route decisions to you. Click any agent to inspect it."
        action={<Badge tone={registry.available ? "blue" : "red"}>{registry.available ? "Registry-backed" : "Registry missing"}</Badge>}
      />

      {!status.agents.length ? (
        <Panel className="mb-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">No agents to map. {registry.error ?? "Check the Hermes registry path."}</p>
        </Panel>
      ) : (
        <div className="mb-6">
          <LiveBrain initial={status} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-command" />
            <h3 className="font-semibold">Clusters</h3>
          </div>
          <div className="space-y-3">
            {(Object.keys(clusterLabel) as Cluster[]).map((cluster) => {
              const members = agents.filter((agent) => (clusterOf[agent.id] ?? "ops") === cluster);
              if (!members.length) return null;
              return (
                <div key={cluster} className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clusterColor[cluster] }} />
                    <span className="text-sm font-semibold">{clusterLabel[cluster]}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{members.map((member) => member.name).join(", ")}</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-command" />
            <h3 className="font-semibold">Shared memory nodes</h3>
          </div>
          {brain.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {brain.map((resource) => (
                <div key={resource.name} className="flex items-center gap-2 rounded-md bg-slate-50 p-2.5 text-sm dark:bg-slate-950">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate">{resource.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No shared brain files found.</div>
          )}
        </Panel>
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <Network className="h-3.5 w-3.5" /> Built from the Hermes registry + runtime status. Live posting stays disabled; everything here is read/draft only.
      </p>
    </>
  );
}
