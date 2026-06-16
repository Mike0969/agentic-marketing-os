import { CheckCircle2, Clock, Layers3, Megaphone } from "lucide-react";
import { ApprovalStatusBadge, ContentStatusBadge } from "@/components/status";
import { PageHeader, Panel, StatCard } from "@/components/ui";
import { byId, getDashboardData } from "@/lib/data";

export default async function HomePage() {
  const data = await getDashboardData();
  const brandMap = byId(data.brands);
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active");
  const approvalQueue = data.contentItems.filter((item) => item.status === "approval" || item.approval_status === "pending");
  const pipelineCounts = data.contentItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Command Center"
        title="Agentic Marketing Agency OS"
        description="A working control tower for campaign strategy, AI agent coordination, content workflow, approvals, and performance review."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active brands" value={data.brands.filter((brand) => brand.active).length} detail="GridFactory and Gulf-EL / NexRide configured" />
        <StatCard label="Active campaigns" value={activeCampaigns.length} detail="Investor and GCC mobility narratives" />
        <StatCard label="Pipeline items" value={data.contentItems.length} detail="Across ideation, publishing, and analysis" />
        <StatCard label="Approval queue" value={approvalQueue.length} detail="Human decisions required before release" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-command" />
            <h2 className="text-lg font-semibold">Content Pipeline Counts</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(pipelineCounts).map(([status, count]) => (
              <div key={status} className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                <ContentStatusBadge status={status as never} />
                <div className="mt-3 text-2xl font-semibold">{count}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-command" />
            <h2 className="text-lg font-semibold">Approval Queue</h2>
          </div>
          <div className="space-y-3">
            {approvalQueue.map((item) => (
              <div key={item.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs text-slate-500">{brandMap.get(item.brand_id)?.name} · {item.platform}</div>
                <div className="mt-3">
                  <ApprovalStatusBadge status={item.approval_status} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-command" />
            <h2 className="text-lg font-semibold">Active Brands</h2>
          </div>
          <div className="space-y-4">
            {data.brands.map((brand) => (
              <div key={brand.id} className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{brand.name}</div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{brand.positioning}</div>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-command" />
            <h2 className="text-lg font-semibold">Recent Activity</h2>
          </div>
          <div className="space-y-4">
            {data.activity.map((item) => (
              <div key={item.id} className="border-l-2 border-slate-300 pl-4 dark:border-slate-700">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.detail}</div>
                <div className="mt-1 text-xs font-medium text-slate-500">{item.timestamp}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
