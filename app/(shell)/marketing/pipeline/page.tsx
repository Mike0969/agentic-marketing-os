import { PipelineWorkspace } from "@/components/os/pipeline-workspace";
import Link from "next/link";
import { OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { FLOW_STEPS, flowView, isSimpleFlow } from "@/lib/marketing/flow-view";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const data = await getDashboardData();
  const active = data.contentItems.filter((item) => ["idea", "brief", "draft", "visual", "approval", "scheduled"].includes(item.status));
  const fallback = active.filter((item) => item.performance_summary?.toUpperCase().includes("FALLBACK")).length;
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const flows = data.campaigns.filter(isSimpleFlow).map((campaign) => flowView(campaign, data.contentItems)).filter((view) => view.step < 5);
  const needsYou = active.filter((item) => item.status === "approval" || item.approval_status === "pending").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Pipeline"
        subtitle="Read-only tracking — where each campaign is right now (owner, state, latest Crina score, fallback/safety). Crina runs the loop automatically; approve final packages in Ready to Post. Nothing posts live."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Active campaigns" value={activeCampaigns} hint="Approved objectives in execution" />
        <OSMetric label="Needs you" value={needsYou} hint="Final package approval only" />
        <OSMetric label="Fallback pieces" value={fallback} hint="Visible and not treated as trusted" />
      </div>
      {flows.length ? (
        <OSPanel className="mb-5">
          <h2 className="text-lg font-semibold text-neutral-50">Campaigns in progress</h2>
          <p className="mt-1 text-sm text-neutral-400">Idea → Crina plans · Jev checks → agents work → your review → schedule.</p>
          <div className="mt-3 space-y-2">
            {flows.map((view) => (
              <Link key={view.campaign.id} href={`/marketing/review/${view.campaign.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 hover:border-neutral-700">
                <div>
                  <div className="text-sm font-medium text-neutral-100">{view.campaign.title}</div>
                  <div className="text-xs text-neutral-400">Step {view.step}: {FLOW_STEPS[view.step - 1].label} · {view.label}</div>
                </div>
                {view.needsMihai ? <OSBadge tone="warn">Needs you</OSBadge> : <OSBadge tone="info">Agents / system</OSBadge>}
              </Link>
            ))}
          </div>
        </OSPanel>
      ) : null}
      <PipelineWorkspace contentItems={active} brands={data.brands} campaigns={data.campaigns} />
    </>
  );
}
