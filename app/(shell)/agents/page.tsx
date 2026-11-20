import { AgentKanbanBoard, type AgentKanbanCard, type AgentKanbanRun } from "@/components/os/agent-kanban-board";
import { OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { listAgentConfigs, resolveAgentRuntimeConfig } from "@/lib/agents/agent-config-store";
import { readHermesRegistry } from "@/lib/agents/hermes-registry";
import { registeredAgents } from "@/lib/agents/registry";
import { summarizeRunOutput } from "@/lib/agents/run-summary";
import { chatModels } from "@/lib/providers/compat";
import { listUserProviders } from "@/lib/providers/user-providers";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { getProvider, isConfigured, PROVIDERS, type ProviderKey } from "@/lib/providers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Agent, AgentRun, AgentRunStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type LoopReceiptRow = {
  id: string;
  loop_type: string;
  agent_id: string;
  round_number: number;
  score_after: number | null;
  decision: string | null;
  stop_reason: string | null;
  output_summary: string | null;
  created_at: string;
};

async function getRecentLoopReceipts(): Promise<LoopReceiptRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return [];
  const { data } = await supabase
    .from("loop_receipts")
    .select("id,loop_type,agent_id,round_number,score_after,decision,stop_reason,output_summary,created_at")
    .order("created_at", { ascending: false })
    .limit(24);
  return (data ?? []) as LoopReceiptRow[];
}

const domainByAgent: Record<string, AgentKanbanCard["domain"]> = {
  "agent-crina": "Marketing",
  "agent-seo": "Marketing",
  "agent-content-creator": "Marketing",
  "agent-visual-video": "Marketing",
  "agent-competitor-intelligence": "Marketing",
  "agent-publishing": "Marketing",
  "agent-conversion": "Marketing",
  "agent-analytics": "Marketing"
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
  if (agent.name.toLowerCase().includes("seo")) return "agent-seo";
  if (agent.name.toLowerCase().includes("crina")) return "agent-crina";
  if (agent.name.toLowerCase().includes("analytics")) return "agent-analytics";
  return agent.id;
}

function summaryFromRun(run: AgentRun | null) {
  if (!run) return null;
  if (run.status === "blocked" && typeof run.output?.summary === "string") return run.output.summary.slice(0, 200);
  // A plain sentence, never raw JSON.
  return summarizeRunOutput(run.output, run.error)?.slice(0, 160) ?? null;
}

function columnFromRun(status: AgentRunStatus | null): AgentKanbanCard["column"] {
  if (!status) return "idle";
  if (status === "error") return "error";
  if (status === "needs_key") return "needs_key";
  if (status === "blocked") return "blocked";
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
    error: run.error,
    output: run.output ?? null
  };
}

// Provider model lists change rarely: cache 6 h and refresh in the background, so the page
// does not call every provider's /models on each load.
type ModelOption = { provider: string; providerLabel: string; model: string; label: string };
let modelOptionsCache: { at: number; options: ModelOption[] } | null = null;
let modelOptionsInflight: Promise<ModelOption[]> | null = null;
async function getModelOptions(): Promise<ModelOption[]> {
  const fresh = modelOptionsCache && Date.now() - modelOptionsCache.at < 6 * 60 * 60 * 1000;
  if (modelOptionsCache && !fresh && !modelOptionsInflight) {
    modelOptionsInflight = loadModelOptions().then((options) => { modelOptionsCache = { at: Date.now(), options }; return options; }).finally(() => { modelOptionsInflight = null; });
    modelOptionsInflight.catch(() => {});
  }
  if (modelOptionsCache) return modelOptionsCache.options;
  const options = await loadModelOptions(); // only the very first load after a restart waits
  modelOptionsCache = { at: Date.now(), options };
  return options;
}

async function loadModelOptions(): Promise<ModelOption[]> {
  // Hermes + env providers (chat models only) + every ENABLED provider added in Settings × its real models.
  const providers = PROVIDERS.filter((provider) => provider.kind === "model" && isConfigured(provider.key));
  const results = await Promise.all(
    providers.map(async (provider) => {
      const providerModule = getProvider(provider.key);
      const result = await providerModule.listModels();
      const ids = provider.key === "hermes" ? result.models.map((m) => m.id) : chatModels(result.models.map((m) => m.id));
      return ids.map((id) => ({ provider: provider.key, providerLabel: `${provider.label} (server)`.replace("Hermes (server)", "Hermes"), model: id, label: id }));
    })
  );
  const user = await listUserProviders().catch(() => []);
  const userOptions = user
    .filter((p) => p.enabled)
    .flatMap((p) => p.models_cache.map((id) => ({ provider: p.providerKey, providerLabel: p.name, model: id, label: id })));
  return [...results.flat(), ...userOptions];
}

export default async function AgentsKanbanPage() {
  const [data, registry, runs, configs, modelOptions, receipts] = await Promise.all([
    getDashboardData(),
    readHermesRegistry(),
    getAgentRuns(undefined, 200),
    listAgentConfigs(),
    getModelOptions(),
    getRecentLoopReceipts()
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
    if (!seen.has(profile.id)) {
      seen.add(profile.id);
      baseAgents.push({ agentId: profile.id, name: profile.name });
    }
  }

  for (const agent of registeredAgents) {
    if (!seen.has(agent.id)) {
      seen.add(agent.id);
      baseAgents.push({ agentId: agent.id, name: agent.name });
    }
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
        subtitle="Cross-domain operating board. Run each agent job, switch model assignments, and inspect recent agent_runs without exposing provider secrets."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <OSMetric label="Agents" value={cards.length} hint="Registry + Supabase roster" />
        <OSMetric label="Done" value={cards.filter((card) => card.column === "done").length} hint="Last run succeeded or fallback" />
        <OSMetric label="Needs key" value={cards.filter((card) => card.column === "needs_key").length} hint="Output ready; a provider key is missing" />
        <OSMetric label="Blocked" value={cards.filter((card) => card.column === "blocked").length} hint="Stopped by a safety check" />
        <OSMetric label="Error" value={cards.filter((card) => card.column === "error").length} hint="Last run failed" />
        <OSMetric label="Model options" value={modelOptions.length} hint="Configured providers only" />
      </div>
      <AgentKanbanBoard
        initialCards={cards}
        providers={[...PROVIDERS.map((p) => ({ key: p.key as string, label: p.label })), ...(await listUserProviders().catch(() => [])).map((p) => ({ key: p.providerKey, label: p.name }))]}
        modelOptions={modelOptions}
      />

      <OSPanel className="mt-6">
        <h2 className="text-lg font-semibold text-neutral-50">Recent loop receipts</h2>
        <p className="mb-3 mt-1 text-sm text-neutral-500">Read-only evidence trail — each judged loop round: the maker, Crina&apos;s rubric score, the decision, and why the loop stopped.</p>
        {receipts.length ? (
          (() => {
            // Rows older than 7 days sit behind "Show older" so old failures don't look current.
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const recent = receipts.filter((r) => new Date(r.created_at).getTime() >= cutoff);
            const older = receipts.filter((r) => new Date(r.created_at).getTime() < cutoff);
            return (
              <>
                {recent.length ? <ReceiptTable rows={recent} /> : <p className="text-sm text-neutral-500">No loop rounds in the last 7 days.</p>}
                {older.length ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-neutral-400 hover:text-neutral-200">Show older ({older.length})</summary>
                    <div className="mt-2 opacity-70">
                      <ReceiptTable rows={older} />
                    </div>
                  </details>
                ) : null}
              </>
            );
          })()
        ) : (
          <p className="text-sm text-neutral-500">No loop receipts yet. Run a campaign to populate the loop evidence trail.</p>
        )}
      </OSPanel>
    </>
  );
}

function ReceiptTable({ rows }: { rows: LoopReceiptRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="py-2 pr-3">When</th>
            <th className="px-3">Loop</th>
            <th className="px-3">Maker</th>
            <th className="px-3 text-right">Round</th>
            <th className="px-3 text-right">Score</th>
            <th className="px-3">Decision</th>
            <th className="px-3">Stop</th>
            <th className="pl-3">Output</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {rows.map((r) => (
            <tr key={r.id} className="text-neutral-300">
              <td className="whitespace-nowrap py-2 pr-3 text-neutral-500">{new Date(r.created_at).toISOString().slice(0, 10)}</td>
              <td className="px-3 capitalize">{r.loop_type}</td>
              <td className="px-3 text-neutral-400">{r.agent_id}</td>
              <td className="px-3 text-right">{r.round_number + 1}</td>
              <td className="px-3 text-right">{r.score_after ?? "—"}</td>
              <td className="px-3"><OSBadge tone={r.decision === "pass" ? "ok" : r.decision === "fail" ? "warn" : "off"}>{r.decision ?? "—"}</OSBadge></td>
              <td className="px-3 text-neutral-400">{r.stop_reason ?? "—"}</td>
              <td className="max-w-xs truncate pl-3 text-neutral-400">{r.output_summary ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
