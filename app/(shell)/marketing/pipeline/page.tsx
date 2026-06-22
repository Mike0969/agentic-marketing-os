import { PipelineWorkspace } from "@/components/os/pipeline-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const data = await getDashboardData();
  const active = data.contentItems.filter((item) => ["idea", "brief", "draft", "visual", "approval", "scheduled"].includes(item.status));
  const fallback = active.filter((item) => item.performance_summary?.toUpperCase().includes("FALLBACK")).length;
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const needsYou = active.filter((item) => item.status === "approval" || item.approval_status === "pending").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Pipeline"
        subtitle="Track approved campaign objectives by current owner: Crina, content, visual, final review, human approval, and publishing prep. Nothing posts live from here."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Active campaigns" value={activeCampaigns} hint="Approved objectives in execution" />
        <OSMetric label="Needs you" value={needsYou} hint="Final package approval only" />
        <OSMetric label="Fallback pieces" value={fallback} hint="Visible and not treated as trusted" />
      </div>
      <PipelineWorkspace contentItems={active} brands={data.brands} campaigns={data.campaigns} />
    </>
  );
}
