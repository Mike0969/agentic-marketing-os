import { CampaignWorkspace } from "@/components/os/campaign-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const data = await getDashboardData();
  const active = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const draft = data.campaigns.filter((campaign) => campaign.status === "planning").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Campaigns"
        subtitle="Campaign objectives, audiences, status, and timelines. Draft means planning in the current Supabase schema."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Campaigns" value={data.campaigns.length} hint="Loaded from campaigns table" />
        <OSMetric label="Active" value={active} hint="Currently in market or production" />
        <OSMetric label="Draft" value={draft} hint="Stored as planning" />
      </div>
      <CampaignWorkspace campaigns={data.campaigns} brands={data.brands} />
    </>
  );
}
