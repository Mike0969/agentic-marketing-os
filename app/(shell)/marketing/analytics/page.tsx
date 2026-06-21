import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Marketing OS" title="Analytics" subtitle="Google Search Console (real, read-only) plus clearly-labelled demo panels. Reuses the kept GSC connector." panels={["Search Console (real)", "Demo: engagement"]} />;
}
