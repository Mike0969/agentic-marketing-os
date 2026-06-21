import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Founder Ops" title="Tasks" subtitle="Cross-domain task board and follow-ups across marketing, trading, and founder work." panels={["Task board", "Follow-ups"]} />;
}
