import { BrandEditor } from "@/components/brand-editor";
import { PageHeader } from "@/components/ui";
import { getDashboardData } from "@/lib/data";

export default async function BrandsPage() {
  const { brands, contentItems } = await getDashboardData();

  return (
    <>
      <PageHeader
        eyebrow="Brand System"
        title="Brands"
        description="Edit the strategic inputs agents will use for positioning, audience selection, voice, and channel execution."
      />
      <BrandEditor brands={brands} contentItems={contentItems} />
    </>
  );
}
