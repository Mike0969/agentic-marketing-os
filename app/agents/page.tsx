import Link from "next/link";
import { Bot, GitBranch, RadioTower, Wand2 } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { listIntegrationConfigs } from "@/lib/integration-store";

export default async function AgentsPage() {
  const { agents } = await getDashboardData();
  const integrations = await listIntegrationConfigs();
  const crinaRuns = await getAgentRuns("Crina");
  const sortedAgents = [...agents].sort((a, b) => (a.name === "Crina" ? -1 : b.name === "Crina" ? 1 : a.name.localeCompare(b.name)));
  const crina = sortedAgents.find((agent) => agent.name === "Crina");
  const otherAgents = sortedAgents.filter((agent) => agent.name !== "Crina");
  const hermes = integrations.find((integration) => integration.provider === "hermes");
  const hermesEndpoint = process.env.HERMES_AGENT_ENDPOINT || hermes?.metadata?.endpoint || "";
  const hermesLive = Boolean(hermesEndpoint);

  return (
    <>
      <PageHeader
        eyebrow="Agent Bench"
        title="AI Marketing Agents"
        description="Crina is the first Hermes-ready agent. Specialist agents remain structured records until their provider adapters are connected."
      />

      {crina ? (
        <Panel className="mb-6">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{crina.name}</h2>
                      <Badge tone="blue">primary agent</Badge>
                      <Badge tone={hermesLive ? "green" : "amber"}>{hermesLive ? "Hermes ready" : "fallback mode"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{crina.role}</p>
                  </div>
                </div>
                <Link
                  href="/workflows/weekly-content-plan"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Run Crina
                </Link>
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-400">{crina.description}</p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Runtime</div>
                  <div className="mt-1 font-medium">{hermesLive ? "Hermes endpoint configured" : "Deterministic fallback"}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Workflow</div>
                  <div className="mt-1 font-medium">Weekly content plan</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pipeline write</div>
                  <div className="mt-1 font-medium">Idea / Brief only</div>
                </div>
              </div>

              <div className="mt-5 rounded-md border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-2 flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-command" />
                  <h3 className="font-semibold">Hermes to Kanban path</h3>
                </div>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Crina receives brand, campaign, audience, platform, and notes context. Hermes returns structured JSON. The app validates the JSON, then
                  <span className="font-medium text-slate-900 dark:text-slate-100"> Create Content Items </span>
                  writes cards into the Content Pipeline as Idea or Brief. Publishing remains blocked until human approval.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <RadioTower className="h-4 w-4 text-command" />
                  <h3 className="font-semibold">Recent Crina Runs</h3>
                </div>
                <Badge tone={crinaRuns.length ? "green" : "neutral"}>{crinaRuns.length ? `${crinaRuns.length} logged` : "none yet"}</Badge>
              </div>
              <div className="space-y-3">
                {crinaRuns.length ? (
                  crinaRuns.map((run) => (
                    <div key={run.id} className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{run.workflow_name}</div>
                        <Badge tone={run.status === "success" ? "green" : run.status === "fallback" ? "amber" : "red"}>{run.status}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Provider: {run.provider} · {new Date(run.created_at).toLocaleString()}
                      </div>
                      {run.error ? <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">{run.error}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                    Run the weekly content workflow once to log Crina activity here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {otherAgents.map((agent) => (
          <Panel key={agent.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{agent.name}</h2>
                  <p className="text-sm text-slate-500">{agent.role}</p>
                </div>
              </div>
              <Badge tone={agent.status === "active" ? "green" : "amber"}>{agent.status}</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">{agent.description}</p>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Model</div>
                <div className="mt-1 font-medium">{agent.model_preference}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Brand scope</div>
                <div className="mt-1 font-medium">{agent.brand_scope}</div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
