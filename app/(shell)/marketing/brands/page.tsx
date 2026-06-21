import { BrandWorkspace } from "@/components/os/brand-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const data = await getDashboardData();
  const activeBrands = data.brands.filter((brand) => brand.active).length;
  const contextFields = data.brands.reduce((count, brand) => {
    return (
      count +
      [
        brand.pillars ?? brand.content_pillars,
        brand.seo_targets,
        brand.ctas ?? brand.reusable_ctas,
        brand.approval_rules,
        brand.proof_points
      ].filter(Boolean).length
    );
  }, 0);

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Brands"
        subtitle="Brand profiles, positioning, pillars, SEO targets, CTAs, and approval rules. This is the context Crina and the specialist agents read before planning."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Brands" value={data.brands.length} hint="Loaded from the brands table" />
        <OSMetric label="Active" value={activeBrands} hint="Available to Crina workflows" />
        <OSMetric label="Context fields" value={contextFields} hint="Pillars, SEO, CTAs, rules, proof" />
      </div>
      <BrandWorkspace brands={data.brands} />
    </>
  );
}
