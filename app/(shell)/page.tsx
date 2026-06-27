import Link from "next/link";
import { ArrowRight, Megaphone, TrendingUp } from "lucide-react";
import { OSBadge, OSPanel, PageHeading } from "@/components/os/ui";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { getHermesHealth } from "@/lib/agents/hermes-health";

export const dynamic = "force-dynamic";

const runTone = (status: string): "ok" | "warn" | "danger" | "off" =>
  status === "success" ? "ok" : status === "fallback" ? "warn" : status === "error" ? "danger" : "off";

export default async function OsHomePage() {
  const [data, runs, hermes] = await Promise.all([getDashboardData(), getAgentRuns(undefined, 5), getHermesHealth()]);

  const activeWork = data.contentItems.filter((item) => !["published", "analyzed"].includes(item.status)).length;

  const domains = [
    {
      href: "/marketing",
      title: "Marketing OS",
      icon: Megaphone,
      tone: "ok" as const,
      status: "Live",
      metricLabel: "Active work items",
      metric: activeWork,
      action: "Open Marketing"
    },
    {
      href: "/sales",
      title: "Sales OS",
      icon: TrendingUp,
      tone: "ok" as const,
      status: "Live",
      metricLabel: "Conversion loop",
      metric: "—",
      action: "Open Sales"
    }
  ];

  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Personal Command Center"
        subtitle="One Hermes-backed operating system for Marketing and Sales conversion. Drafts only — no live posting."
        action={<OSBadge tone={hermes.connected ? "ok" : hermes.configured ? "warn" : "off"}>{hermes.connected ? "Hermes connected" : hermes.configured ? "Hermes configured" : "Hermes offline"}</OSBadge>}
      />

      {/* Domain cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {domains.map((d) => {
          const Icon = d.icon;
          return (
            <Link key={d.href} href={d.href} className="group block">
              <OSPanel className="h-full transition group-hover:border-neutral-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-neutral-100 text-neutral-950">
                    <Icon className="h-5 w-5" />
                  </div>
                  <OSBadge tone={d.tone}>{d.status}</OSBadge>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-neutral-50">{d.title}</h2>
                <div className="mt-3 text-xs uppercase tracking-wider text-neutral-500">{d.metricLabel}</div>
                <div className="text-2xl font-semibold text-neutral-100">{d.metric}</div>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-neutral-300 group-hover:text-neutral-50">
                  {d.action} <ArrowRight className="h-4 w-4" />
                </div>
              </OSPanel>
            </Link>
          );
        })}
      </div>

      {/* Recent agent runs (all domains) */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <OSPanel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-neutral-100">Recent agent runs</h3>
            <span className="text-xs text-neutral-500">last {runs.length} across all domains</span>
          </div>
          {runs.length ? (
            <div className="divide-y divide-neutral-800">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-200">{run.agent_name} · {run.workflow_name}</div>
                    <div className="text-xs text-neutral-500">
                      {run.provider} · {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>
                  <OSBadge tone={runTone(run.status)}>{run.status}</OSBadge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No agent runs logged yet.</p>
          )}
        </OSPanel>

        {/* Quick actions */}
        <OSPanel>
          <h3 className="mb-1 font-semibold text-neutral-100">Quick actions</h3>
          <p className="mb-4 text-xs text-neutral-500">Most common task per domain. Wiring to Hermes lands per CODEX_PLAN.md.</p>
          <div className="space-y-2">
            <Link href="/marketing/workflows/weekly-content-plan" className="flex items-center justify-between rounded-md border border-neutral-800 px-3 py-2.5 text-sm hover:bg-neutral-900">
              <span>Run Crina weekly content plan</span>
              <ArrowRight className="h-4 w-4 text-neutral-500" />
            </Link>
            <Link href="/sales" className="flex items-center justify-between rounded-md border border-neutral-800 px-3 py-2.5 text-sm hover:bg-neutral-900">
              <span>Open Sales conversion</span>
              <ArrowRight className="h-4 w-4 text-neutral-500" />
            </Link>
          </div>
        </OSPanel>
      </div>
    </>
  );
}
