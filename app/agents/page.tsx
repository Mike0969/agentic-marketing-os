import { Bot } from "lucide-react";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { getDashboardData } from "@/lib/data";

export default async function AgentsPage() {
  const { agents } = await getDashboardData();

  return (
    <>
      <PageHeader
        eyebrow="Agent Bench"
        title="AI Marketing Agents"
        description="Default operating roles are represented here. Real model calls, queues, and n8n workflows can attach to these records."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
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
