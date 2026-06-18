import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileText,
  GitBranch,
  Lock,
  Network,
  RadioTower,
  ShieldCheck,
  Workflow
} from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { getAgentRuns } from "@/lib/data";
import { readHermesRegistry, type HermesAgentProfile } from "@/lib/agents/hermes-registry";
import { listAgentSettings } from "@/lib/agents/agent-config-store";
import { listModelNames } from "@/lib/agents/model-registry";
import { AgentModelPicker } from "@/components/agent-model-picker";
import { AgentMemoryEditor } from "@/components/agent-memory-editor";
import { subAgentConfigs } from "@/lib/agents/agent-catalog";
import type { AgentRun } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTokens(run?: AgentRun) {
  if (!run) return "—";
  if (run.tokens_total != null) return `${run.tokens_total}`;
  if (run.tokens_prompt != null || run.tokens_completion != null) return `${run.tokens_prompt ?? 0}+${run.tokens_completion ?? 0}`;
  return "n/a";
}

function formatDuration(run?: AgentRun) {
  if (!run || run.duration_ms == null) return "—";
  if (run.duration_ms < 1000) return `${run.duration_ms} ms`;
  return `${(run.duration_ms / 1000).toFixed(1)} s`;
}

function statusTone(status?: AgentRun["status"]) {
  if (status === "success") return "green" as const;
  if (status === "fallback") return "amber" as const;
  if (status === "error") return "red" as const;
  return "neutral" as const;
}

function runsForAgent(runs: AgentRun[], profile: HermesAgentProfile) {
  return runs.filter((run) => run.agent_id === profile.id || run.agent_name === profile.name);
}

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

export default async function AgentBrainPage() {
  const [registry, runs, settings, modelNames] = await Promise.all([
    readHermesRegistry(),
    getAgentRuns(undefined, 100),
    listAgentSettings(),
    listModelNames()
  ]);

  const endpoint = registry.team?.apiTargeting.endpoint || process.env.HERMES_AGENT_ENDPOINT || "";
  const hermesConfigured = Boolean(endpoint);
  const defaultModel = registry.team?.defaultModel || process.env.HERMES_AGENT_MODEL || "gpt-5.5";
  const backupModelRaw = registry.team?.backupModel || process.env.HERMES_AGENT_BACKUP_MODEL || "";
  const backupModel = backupModelRaw || "—";
  const livePosting = registry.team?.livePostingEnabled === true;

  const agents = registry.team?.agents ?? [];
  const settingsByAgent = new Map(settings.map((setting) => [setting.agent_id, setting]));
  const successRuns = runs.filter((run) => run.status === "success").length;
  const fallbackRuns = runs.filter((run) => run.status === "fallback").length;
  const errorRuns = runs.filter((run) => run.status === "error").length;

  const handoffPath = ["Crina", "SEO / Competitor Intel", "Content Creator", "Visual & Video", "Approval Queue", "Publishing (draft only)", "Analytics"];

  return (
    <>
      <PageHeader
        eyebrow="Agent Brain"
        title="Agentic Control Room"
        description="Live observability for the Hermes agent team — registry identity, shared brain, runs, model usage, latency, and handoffs. Treats team.json as the source of truth."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={registry.available ? "blue" : "red"}>{registry.available ? "Registry-backed" : "Registry missing"}</Badge>
            <Badge tone={livePosting ? "red" : "green"}>{livePosting ? "Live posting ON" : "Live posting disabled"}</Badge>
          </div>
        }
      />

      {/* Source-of-truth explainer */}
      <Panel className="mb-6 border-l-4 border-l-command">
        <div className="flex items-start gap-3">
          <Network className="mt-0.5 h-5 w-5 shrink-0 text-command" />
          <div className="space-y-2 text-sm leading-6">
            <div className="font-semibold">Registry-backed team, not Hermes UI profiles</div>
            <p className="text-slate-600 dark:text-slate-400">
              These agents exist as a Hermes <span className="font-medium text-slate-900 dark:text-slate-100">team registry</span> (
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">team.json</code>) plus shared brain resources. They are
              <span className="font-medium"> not native Hermes app UI profiles</span>, so they will not appear in the Hermes desktop app agent list. The
              dashboard addresses each one through generic OpenAI-compatible chat completions, injecting the agent id, role, allowed/blocked actions, and brain
              context into every call.
            </p>
            {registry.team ? (
              <p className="text-xs text-slate-500">
                Native agent-id routing: <span className="font-semibold">{registry.team.apiTargeting.nativeAgentIdRouting ? "yes" : "no"}</span> ·{" "}
                {registry.team.apiTargeting.routingMethod}
              </p>
            ) : null}
          </div>
        </div>
      </Panel>

      {!registry.available ? (
        <Panel className="mb-6 border border-rose-200 dark:border-rose-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="text-sm">
              <div className="font-semibold">Hermes registry unavailable</div>
              <p className="mt-1 text-slate-600 dark:text-slate-400">{registry.error ?? "team.json could not be read."}</p>
              <p className="mt-2 text-xs text-slate-500">
                Expected at <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{registry.teamPath}</code>. Set{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">HERMES_TEAM_PATH</code> to override. Agents below will be empty until the
                registry is reachable.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* Top metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered agents" value={agents.length} detail="From Hermes team.json" />
        <StatCard label="Successful runs" value={successRuns} detail={`${fallbackRuns} fallback · ${errorRuns} error`} />
        <StatCard label="Default / backup model" value={defaultModel} detail={`Backup: ${backupModel}`} />
        <StatCard label="Hermes endpoint" value={hermesConfigured ? "Configured" : "Not set"} detail={hermesConfigured ? endpoint : "Deterministic fallback only"} />
      </div>

      {/* Connection + safety strip */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-command" />
            <h3 className="font-semibold">Hermes connection</h3>
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Routing method</dt>
              <dd className="font-medium">Generic OpenAI chat completions</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Endpoint</dt>
              <dd className="truncate font-medium">{endpoint || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Default model</dt>
              <dd className="font-medium">{defaultModel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Backup model</dt>
              <dd className="font-medium">{backupModel}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-command" />
            <h3 className="font-semibold">Safety posture</h3>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-600" />
              Live social posting is <span className="font-semibold">disabled</span>.
            </li>
            <li className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-600" />
              Publishing Agent prepares <span className="font-semibold">drafts only</span> and can never publish.
            </li>
            <li className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-600" />
              No agent may approve its own content; human approval is required.
            </li>
            <li className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-500" />
              Secrets are never read into or returned from this view.
            </li>
          </ul>
        </Panel>
      </div>

      {/* Handoff path */}
      <Panel className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Workflow className="h-4 w-4 text-command" />
          <h3 className="font-semibold">Orchestration handoff path</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {handoffPath.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium dark:bg-slate-800">{step}</span>
              {index < handoffPath.length - 1 ? <ArrowRight className="h-4 w-4 text-slate-400" /> : null}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Crina orchestrates; specialists draft; everything routes through the Approval Queue before any human-driven publishing. Publishing remains draft-only.
        </p>
      </Panel>

      {/* Shared brain */}
      <Panel className="mb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-command" />
            <h3 className="font-semibold">Shared brain resources</h3>
          </div>
          <Badge tone={registry.brainResources.length ? "blue" : "neutral"}>
            {registry.team?.sharedBrain ?? "no collection"} · {registry.brainResources.length} files
          </Badge>
        </div>
        {registry.brainResources.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {registry.brainResources.map((resource) => (
              <div key={resource.name} className="flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{resource.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatBytes(resource.sizeBytes)} · {new Date(resource.modifiedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            No shared brain files found{registry.brainPath ? ` at ${registry.brainPath}` : ""}. Set{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">HERMES_BRAIN_PATH</code> if the path differs.
          </div>
        )}
      </Panel>

      {/* Agent grid */}
      <div className="grid gap-5 xl:grid-cols-2">
        {agents.map((agent) => {
          const agentRuns = runsForAgent(runs, agent);
          const latest = agentRuns[0];
          const setting = settingsByAgent.get(agent.id);
          return (
            <Panel key={agent.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{agent.name}</h2>
                      {agent.primary ? <Badge tone="blue">primary</Badge> : null}
                    </div>
                    <p className="text-sm text-slate-500">{agent.role}</p>
                  </div>
                </div>
                <Badge tone={statusTone(latest?.status)}>{latest ? latest.status : "no runs"}</Badge>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{agent.purpose}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Model preference</div>
                  <div className="mt-1 font-medium">{agent.default_model || defaultModel}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Agent id</div>
                  <div className="mt-1 font-mono text-xs">{agent.id}</div>
                </div>
              </div>

              {/* Allowed / blocked */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-emerald-100 p-3 dark:border-emerald-950">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Allowed
                  </div>
                  <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    {agent.allowed_actions.length ? agent.allowed_actions.map((a) => <li key={a}>• {a}</li>) : <li>—</li>}
                  </ul>
                </div>
                <div className="rounded-md border border-rose-100 p-3 dark:border-rose-950">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">
                    <Ban className="h-3.5 w-3.5" /> Blocked
                  </div>
                  <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    {agent.blocked_actions.length ? agent.blocked_actions.map((a) => <li key={a}>• {a}</li>) : <li>—</li>}
                  </ul>
                </div>
              </div>

              {/* Per-agent model override + memory */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AgentModelPicker
                  agentId={agent.id}
                  currentModel={setting?.model ?? null}
                  defaultModel={agent.default_model || defaultModel}
                  models={modelNames}
                />
                <AgentMemoryEditor agentId={agent.id} />
              </div>

              <div className="mt-4 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Visible brain resources</div>
                <div className="flex flex-wrap gap-1.5">
                  {(brainFilesByAgentId.get(agent.id) ?? []).map((file) => (
                    <span key={file} className="rounded bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                      {file.replace(".md", "")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Observability strip */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Last model</div>
                  <div className="mt-0.5 truncate text-sm font-medium">{latest?.model ?? "—"}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <Clock className="h-3 w-3" /> Latency
                  </div>
                  <div className="mt-0.5 text-sm font-medium">{formatDuration(latest)}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tokens</div>
                  <div className="mt-0.5 text-sm font-medium">{formatTokens(latest)}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">HTTP</div>
                  <div className="mt-0.5 text-sm font-medium">{latest?.provider_response_status ?? "—"}</div>
                </div>
              </div>

              {/* Handoff for this agent */}
              {latest?.handoff_to || latest?.handoff_from ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span className="font-medium">{latest?.handoff_from ?? agent.name}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium">{latest?.handoff_to ?? "—"}</span>
                </div>
              ) : null}

              {/* Recent runs */}
              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent runs</div>
                {agentRuns.length ? (
                  <div className="space-y-2">
                    {agentRuns.slice(0, 3).map((run) => (
                      <div key={run.id} className="rounded-md bg-slate-50 p-2.5 text-xs dark:bg-slate-950">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{run.workflow_name}</span>
                          <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                        </div>
                        <div className="mt-1 text-slate-500">
                          {run.provider} · {new Date(run.created_at).toLocaleString()}
                          {run.brain_resources_used?.length ? ` · brain: ${run.brain_resources_used.length} files` : ""}
                        </div>
                        {run.error ? <div className="mt-1 text-amber-700 dark:text-amber-300">{run.error}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
                    No runs logged yet for this agent.
                  </div>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
