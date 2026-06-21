import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Founder Ops" title="Research" subtitle="EV, data-center, and market research notes with Hermes-assisted summaries. Decision support only." panels={["Research notes", "Summaries"]} />;
}
