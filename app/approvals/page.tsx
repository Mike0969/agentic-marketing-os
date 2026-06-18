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
        description="Review finished drafts before scheduling or publishing. Approval decisions are saved to Supabase when configured, with local fallback for offline development."
      />
      <ApprovalQueue brands={brands} contentItems={contentItems} />
    </>
  );
}
