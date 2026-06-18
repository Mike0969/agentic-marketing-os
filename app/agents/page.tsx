import Link from "next/link";
import { Bot, BrainCircuit, CheckCircle2, GitBranch, RadioTower, ShieldCheck, Wand2 } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { listAgentSettings } from "@/lib/agents/agent-config-store";
import { readHermesRegistry, type HermesAgentProfile } from "@/lib/agents/hermes-registry";
import { subAgentConfigs } from "@/lib/agents/agent-catalog";

export const dynamic = "force-dynamic";

const crinaBrainFiles = [
  "brand-briefs.md",
  "brand-voice.md",
  "winning-hooks.md",
  "weak-hooks.md",
  "competitor-references.md",
  "seo-targets.md",
  "content-formulas.md",
  "approval-rules.md",
  "reusable-ctas.md",
  "workflow-contract.md",
  "agent-crina-memory.md",
  "agent-output-schemas.md"
];

const brainFilesByAgentId = new Map([
  ["agent-crina", crinaBrainFiles],
  ...Object.values(subAgentConfigs).map((config) => [config.agentId, config.brainFiles ?? []] as const)
]);

function toneForRun(status?: string) {
  if (status === "success") return "green" as const;
  if (status === "fallback") return "amber" as const;
  if (status === "error") return "red" as const;
  return "neutral" as const;
}

function runsForAgent(runs: Awaited<ReturnType<typeof getAgentRuns>>, agent: HermesAgentProfile) {
  return runs.filter((run) => run.agent_id === agent.id || run.agent_name === agent.name);
}

function legacyByName(agents: Awaited<ReturnType<typeof getDashboardData>>["agents"]) {
  return new Map(agents.map((agent) => [agent.name, agent]));
}

export default async function AgentsPage() {
  const [data, registry, settings, runs] = await Promise.all([
    getDashboardData(),
    readHermesRegistry(),
    listAgentSettings(),
    getAgentRuns(undefined, 100)
  ]);

  const settingsByAgent = new Map(settings.map((setting) => [setting.agent_id, setting]));
  const legacyAgents = legacyByName(data.agents);
  const runtimeAgents = registry.team?.agents ?? [];
  const endpoint = registry.team?.apiTargeting.endpoint || process.env.HERMES_AGENT_ENDPOINT || "";
  const defaultModel = registry.team?.defaultModel || process.env.HERMES_AGENT_MODEL || "gpt-5.5";
  const backupModel = registry.team?.backupModel || process.env.HERMES_AGENT_BACKUP_MODEL || "—";
  const activePipelineItems = data.contentItems.filter((item) => !["published", "analyzed"].includes(item.status)).length;
  const pendingApprovals = data.approvals.filter((approval) => approval.decision === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow="Agent Bench"
        title="AI Marketing Agents"
        description="Runtime view of the Hermes registry, real model overrides, shared brain resources, recent runs, and current shared-work paths."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone={registry.available ? "blue" : "red"}>{registry.available ? "Hermes registry" : "Registry missing"}</Badge>
            <Badge tone={endpoint ? "green" : "amber"}>{endpoint ? "Hermes endpoint configured" : "Fallback mode"}</Badge>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Runtime agents" value={runtimeAgents.length} detail="From Hermes team.json" />
        <StatCard label="Default / backup" value={defaultModel} detail={`Backup: ${backupModel}`} />
        <StatCard label="Open pipeline work" value={activePipelineItems} detail={`${pendingApprovals} approval item(s)`} />
        <StatCard label="Logged agent runs" value={runs.length} detail="Supabase agent_runs observability" />
      </div>

      <Panel className="mb-6 border-l-4 border-l-command">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-command" />
          <div className="space-y-2 text-sm leading-6">
            <div className="font-semibold">What is real here</div>
            <p className="text-slate-600 dark:text-slate-400">
              The source of truth for execution is Hermes <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">team.json</code>, the
              shared brain, Supabase <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">agent_settings</code>, and
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800"> agent_runs</code>. The older Supabase
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800"> agents</code> table is kept as an ops/profile record.
            </p>
          </div>
        </div>
      </Panel>

      <Panel className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-command" />
          <h3 className="font-semibold">Shared-work awareness</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current card path</div>
            <div className="mt-1 text-sm font-medium">Crina → assigned specialist → Approval Queue</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Team report path</div>
            <div className="mt-1 text-sm font-medium">Research + SEO + Content + Visual → Crina synthesis</div>
          </div>
          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next chain</div>
            <div className="mt-1 text-sm font-medium">SEO → Content → Visual on same card</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Publishing remains draft-only. Human approval is still required before scheduled/published workflows.</p>
      </Panel>

      {!runtimeAgents.length ? (
        <Panel>
          <p className="text-sm text-slate-600 dark:text-slate-400">{registry.error ?? "No Hermes registry agents found."}</p>
        </Panel>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {runtimeAgents.map((agent) => {
            const setting = settingsByAgent.get(agent.id);
            const agentRuns = runsForAgent(runs, agent);
            const latest = agentRuns[0];
            const legacy = legacyAgents.get(agent.name);
            const brainFiles = brainFilesByAgentId.get(agent.id) ?? [];
            const memoryReady = registry.brainResources.some((resource) => resource.name === `agent-${agent.id.replace(/^agent-/, "")}-memory.md`);
            const effectiveModel = setting?.model || agent.default_model || defaultModel;

            return (
              <Panel key={agent.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{agent.name}</h2>
                        {agent.primary ? <Badge tone="blue">primary</Badge> : null}
                        <Badge tone={memoryReady ? "green" : "amber"}>{memoryReady ? "brain ready" : "memory missing"}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{agent.role}</p>
                    </div>
                  </div>
                  <Badge tone={toneForRun(latest?.status)}>{latest?.status ?? "no runs"}</Badge>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">{agent.purpose}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Runtime model</div>
                    <div className="mt-1 truncate font-medium">{effectiveModel}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Enabled</div>
                    <div className="mt-1 font-medium">{setting?.enabled === false ? "Disabled" : "Enabled"}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supabase profile</div>
                    <div className="mt-1 font-medium">{legacy?.status ?? "not mapped"}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-emerald-100 p-3 dark:border-emerald-950">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Allowed
                    </div>
                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                      {agent.allowed_actions.map((action) => <li key={action}>• {action}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <BrainCircuit className="h-3.5 w-3.5" /> Brain resources
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {brainFiles.slice(0, 8).map((file) => (
                        <span key={file} className="rounded bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800">
                          {file.replace(".md", "")}
                        </span>
                      ))}
                      {brainFiles.length > 8 ? <span className="text-[11px] text-slate-500">+{brainFiles.length - 8} more</span> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">
                  <div className="flex items-center gap-2">
                    <RadioTower className="h-3.5 w-3.5" />
                    <span>
                      {agentRuns.length ? `${agentRuns.length} run(s) logged. Latest: ${latest?.workflow_name}` : "No runtime runs yet."}
                    </span>
                  </div>
                  {latest?.brain_resources_used?.length ? <div className="mt-1">Last run used {latest.brain_resources_used.length} brain resource(s).</div> : null}
                </div>

                {agent.name === "Crina" ? (
                  <Link href="/workflows/weekly-content-plan" className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                    <Wand2 className="mr-2 h-4 w-4" />
                    Run Crina
                  </Link>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
