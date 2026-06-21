import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Founder Ops" title="Investors" subtitle="Investor materials, updates, and pipeline. Drafting and decision support only." panels={["Investor pipeline", "Update drafts"]} />;
}
