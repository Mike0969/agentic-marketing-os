import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Marketing OS" title="Approvals" subtitle="Human approval gates. Reuses the Supabase approvals table. Nothing publishes automatically." panels={["Pending queue", "Decision panel"]} />;
}
