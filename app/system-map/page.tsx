import { BrainCircuit, FileText, Layers, Network, Share2 } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { readHermesRegistry } from "@/lib/agents/hermes-registry";

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

// Fixed ring order so the handoff pipeline reads cleanly around the circle.
const ringOrder = ["agent-competitor-intelligence", "agent-seo", "agent-content-creator", "agent-visual-video", "agent-publishing", "agent-analytics"];

export default async function SystemMapPage() {
  const registry = await readHermesRegistry();
  const agents = registry.team?.agents ?? [];
  const brain = registry.brainResources;

  const cx = 400;
  const cy = 300;
  const radius = 215;

  const ringAgents = ringOrder.map((id) => agents.find((agent) => agent.id === id)).filter(Boolean) as typeof agents;
  const positions = new Map<string, { x: number; y: number }>();
  positions.set("agent-crina", { x: cx, y: cy });
  ringAgents.forEach((agent, index) => {
    const angle = (-90 + (index * 360) / Math.max(ringAgents.length, 1)) * (Math.PI / 180);
    positions.set(agent.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  });

  const crina = agents.find((agent) => agent.id === "agent-crina");
  const spokeCount = crina ? ringAgents.length : 0;
  const pipelineLinks = ringAgents.length ? ringAgents.length : 0; // consecutive + loop back
  const totalLinks = spokeCount + pipelineLinks;
  const clusters = new Set(agents.map((agent) => clusterOf[agent.id] ?? "ops")).size;

  function point(id: string) {
    return positions.get(id) ?? { x: cx, y: cy };
  }

  return (
    <>
      <PageHeader
        eyebrow="System Map"
        title="Agent OS Knowledge Map"
        description="A live map of how the agent team connects — orchestration spokes, the handoff pipeline, clusters, and shared brain memory. Inspired by Graphify; this maps the agent system from the Hermes registry (not the source tree)."
        action={<Badge tone={registry.available ? "blue" : "red"}>{registry.available ? "Registry-backed" : "Registry missing"}</Badge>}
      />

      <Panel className="mb-6 border-l-4 border-l-command">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-command" />
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
            This is a <span className="font-medium text-slate-900 dark:text-slate-100">system map</span> of the agent team and its memory, generated from
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">team.json</code> + the shared brain. It is the agent-OS analogue of a
            Graphify code map: nodes are agents/resources, edges are orchestration and handoffs, and colors are clusters. It is not the external Graphify tool and does
            not index the source tree.
          </p>
        </div>
      </Panel>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Agent nodes" value={agents.length} detail="From Hermes registry" />
        <StatCard label="Memory nodes" value={brain.length} detail="Shared brain files" />
        <StatCard label="Links" value={totalLinks} detail="Orchestration + handoffs" />
        <StatCard label="Clusters" value={clusters} detail="Orchestration · Intelligence · Content · Ops" />
      </div>

      <Panel className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-command" />
            <h3 className="font-semibold">Team graph</h3>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {(Object.keys(clusterLabel) as Cluster[]).map((cluster) => (
              <span key={cluster} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: clusterColor[cluster] }} />
                {clusterLabel[cluster]}
              </span>
            ))}
          </div>
        </div>

        {agents.length ? (
          <div className="overflow-x-auto">
            <svg viewBox="0 0 800 600" className="mx-auto h-auto w-full max-w-4xl" role="img" aria-label="Agent team graph">
              {/* Orchestration spokes */}
              {crina
                ? ringAgents.map((agent) => {
                    const p = point(agent.id);
                    return <line key={`spoke-${agent.id}`} x1={cx} y1={cy} x2={p.x} y2={p.y} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1.5} />;
                  })
                : null}

              {/* Handoff pipeline around the ring + loop back to Crina */}
              {ringAgents.map((agent, index) => {
                const from = point(agent.id);
                const next = ringAgents[(index + 1) % ringAgents.length];
                const to = index === ringAgents.length - 1 ? point("agent-crina") : point(next.id);
                return <line key={`flow-${agent.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={clusterColor.orchestration} strokeWidth={2} strokeOpacity={0.5} />;
              })}

              {/* Agent nodes */}
              {agents.map((agent) => {
                const p = point(agent.id);
                const cluster = clusterOf[agent.id] ?? "ops";
                const isCrina = agent.id === "agent-crina";
                const r = isCrina ? 34 : 26;
                return (
                  <g key={agent.id}>
                    <circle cx={p.x} cy={p.y} r={r} fill={clusterColor[cluster]} stroke={isCrina ? "#facc15" : "#ffffff"} strokeWidth={isCrina ? 3 : 2} />
                    <text x={p.x} y={p.y + r + 16} textAnchor="middle" className="fill-slate-700 text-[13px] font-semibold dark:fill-slate-200">
                      {agent.name}
                    </text>
                    {isCrina ? (
                      <text x={p.x} y={p.y + 5} textAnchor="middle" className="fill-white text-[11px] font-bold">
                        CEO
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
            No agents in the registry to map. {registry.error ?? ""}
          </div>
        )}
        <p className="mt-3 text-center text-xs text-slate-500">
          Spokes = Crina orchestration · colored ring = handoff pipeline (Competitor → SEO → Content → Visual → Publishing → Analytics → Crina).
        </p>
      </Panel>

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
    </>
  );
}
