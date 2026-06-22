import { CampaignWorkspace } from "@/components/os/campaign-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const data = await getDashboardData();
  const active = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const draft = data.campaigns.filter((campaign) => campaign.status === "planning").length;
  const paused = data.campaigns.filter((campaign) => campaign.status === "paused").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Campaign Objectives"
        subtitle="Create the source objective for Crina. You approve direction first; Crina runs the agent loops; you approve the final package before publishing prep."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <OSMetric label="Objectives" value={data.campaigns.length} hint="Campaign sources" />
        <OSMetric label="Awaiting direction" value={draft} hint="Needs approval before Crina" />
        <OSMetric label="In execution" value={active} hint="Crina-led agent work" />
        <OSMetric label="Needs rework" value={paused} hint="Returned with feedback" />
      </div>
      <CampaignWorkspace campaigns={data.campaigns} brands={data.brands} contentItems={data.contentItems} />
    </>
  );
}
