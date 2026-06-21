import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Founder Ops" title="Daily Review" subtitle="A cross-domain morning brief: marketing status, trading bias, top priorities. Decision support only." panels={["Today's brief", "Priorities"]} />;
}
