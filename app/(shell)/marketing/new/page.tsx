import { NewCampaignFlow } from "@/components/os/new-campaign-flow";
import { PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const data = await getDashboardData();
  const brand = data.brands.find((item) => item.active) ?? null;
  return (
    <>
      <PageHeading eyebrow="Marketing" title="New campaign" subtitle="Write your idea. Crina plans it, Jev checks the plan, the agents make the posts, and you say Yes or Rework on each part." />
      <NewCampaignFlow brandName={brand?.name ?? null} />
    </>
  );
}
