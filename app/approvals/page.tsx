import { ApprovalQueue } from "@/components/approval-queue";
import { PageHeader } from "@/components/ui";
import { getDashboardData } from "@/lib/data";

export default async function ApprovalsPage() {
  const { brands, contentItems } = await getDashboardData();

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Approval Queue"
        description="Review content before scheduling or publishing. Decisions are mocked locally until Supabase mutations are connected."
      />
      <ApprovalQueue brands={brands} contentItems={contentItems} />
    </>
  );
}
