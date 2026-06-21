import { ModuleCard, OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MarketingHome() {
  const data = await getDashboardData();
  const pending = data.contentItems.filter((item) => item.approval_status === "pending").length;

  const modules = [
    { href: "/marketing/brands", title: "Brands", description: "Brand profiles, positioning, pillars, SEO targets, CTAs.", badge: "rebuild" },
    { href: "/marketing/campaigns", title: "Campaigns", description: "Campaign objectives, audiences, and timelines.", badge: "rebuild" },
    { href: "/marketing/pipeline", title: "Pipeline", description: "Idea → draft → visual → approval production board.", badge: "rebuild" },
    { href: "/marketing/approvals", title: "Approvals", description: "Human approval gates. Nothing publishes automatically.", badge: "rebuild" },
    { href: "/marketing/analytics", title: "Analytics", description: "Search Console (real) + clearly-labelled demo panels.", badge: "rebuild" },
    { href: "/marketing/agents", title: "Agents", description: "Marketing agent roster + observability.", badge: "rebuild" }
  ];

  return (
    <>
      <PageHeading eyebrow="Marketing OS" title="Marketing Command Center" subtitle="Crina-led content production. Drafts only — live publishing stays disabled." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OSMetric label="Brands" value={data.brands.length} hint="Supabase brands table" />
        <OSMetric label="Campaigns" value={data.campaigns.length} hint="Supabase campaigns table" />
        <OSMetric label="Content items" value={data.contentItems.length} hint="Pipeline records" />
        <OSMetric label="Pending approvals" value={pending} hint="Human gates" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <ModuleCard key={m.href} {...m} />
        ))}
      </div>
    </>
  );
}
