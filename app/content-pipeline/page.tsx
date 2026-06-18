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
        description="Crina's approved ideas/briefs are dispatched to their assigned specialist with one click; the specialist's draft is written back onto the same card. Drafts then go to Approvals. Nothing is published."
      />
      <PipelineBoard items={contentItems} brandNames={brandNames} />
    </>
  );
}
