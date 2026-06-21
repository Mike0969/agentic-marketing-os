import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Marketing OS" title="Campaigns" subtitle="Objectives, audiences, and timelines. Reuses the Supabase campaigns table." panels={["Campaign list", "Campaign editor"]} />;
}
