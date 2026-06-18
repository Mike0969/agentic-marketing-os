import { CampaignManager } from "@/components/campaign-manager";
import { PageHeader } from "@/components/ui";
import { getDashboardData } from "@/lib/data";

export default async function CampaignsPage() {
  const { brands, campaigns } = await getDashboardData();

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="Campaign Planning"
        description="Campaigns are strategic containers and status records for Crina and the specialist agents. Start planning from Workflows; use this tab to inspect active campaigns or save a manual admin record."
      />
      <CampaignManager brands={brands} campaigns={campaigns} />
    </>
  );
}
