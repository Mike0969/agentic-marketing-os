import { PageHeader } from "@/components/ui";
import { PipelineBoard } from "@/components/pipeline-board";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ContentPipelinePage() {
  const { brands, contentItems } = await getDashboardData();
  const brandNames = Object.fromEntries(brands.map((brand) => [brand.id, brand.name]));

  return (
    <>
      <PageHeader
        eyebrow="Workflow"
        title="Content Pipeline"
        description="A compact production monitor: pick a Crina idea, produce it, then review finished drafts in Approvals. Approved work leaves the active queue. Nothing is published automatically."
      />
      <PipelineBoard items={contentItems} brandNames={brandNames} />
    </>
  );
}
