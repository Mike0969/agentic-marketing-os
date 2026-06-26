import { IdeasBoard } from "@/components/os/ideas-board";
import { PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const data = await getDashboardData();

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Campaigns"
        subtitle="Pick a brand, let Crina propose campaign ideas, then choose which to run. Nothing runs until you select."
      />
      <IdeasBoard brands={data.brands} campaigns={data.campaigns} />
    </>
  );
}
