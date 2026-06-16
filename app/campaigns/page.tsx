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
        description="Create campaign records and keep brand-specific objectives ready for agent-generated briefs and content."
      />
      <CampaignManager brands={brands} campaigns={campaigns} />
    </>
  );
}
