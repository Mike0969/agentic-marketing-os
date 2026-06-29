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
        subtitle="Pick a brand, let Crina propose ideas, then refine and Run one. Crina runs the agent loop and the final package appears in Ready to Post for your approval. Nothing posts live."
      />
      <IdeasBoard brands={data.brands} campaigns={data.campaigns} />
    </>
  );
}
