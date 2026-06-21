import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Marketing OS" title="Pipeline" subtitle="Idea → draft → visual → approval production board. Reuses the Supabase content_items table. Drafts only." panels={["Production board", "Dispatch to agent"]} />;
}
