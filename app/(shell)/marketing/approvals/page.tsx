import { DecisionDesk } from "@/components/os/decision-desk";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MarketingApprovalsPage() {
  const data = await getDashboardData();
  const directionCampaigns = data.campaigns.filter((campaign) => campaign.status === "planning");
  const finalItems = data.contentItems.filter(
    (item) => item.status === "approval" || item.approval_status === "pending" || item.workflow_stage === "human_final_approval"
  );
  const fallback = finalItems.filter((item) => item.performance_summary?.toUpperCase().includes("FALLBACK")).length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Decisions"
        subtitle="Two moments need you: approve a campaign direction before Crina starts, then approve the final package before publishing prep. Approval never posts live."
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Campaign directions" value={directionCampaigns.length} hint="Approve or send back to Crina" />
        <OSMetric label="Final packages" value={finalItems.length} hint="Pre-publish human gate" />
        <OSMetric label="Fallback" value={fallback} hint="Needs extra scrutiny" />
      </div>

      <DecisionDesk campaigns={directionCampaigns} contentItems={finalItems} brands={data.brands} />
    </>
  );
}
