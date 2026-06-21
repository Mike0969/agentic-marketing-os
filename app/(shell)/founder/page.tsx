import { ModuleCard, OSBadge, PageHeading } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function FounderHome() {
  const modules = [
    { href: "/founder/daily-review", title: "Daily Review", description: "Morning brief across marketing, trading, and priorities.", badge: "No backend" },
    { href: "/founder/tasks", title: "Tasks", description: "Cross-domain task board and follow-ups.", badge: "No backend" },
    { href: "/founder/research", title: "Research", description: "EV, data-center, and market research notes.", badge: "No backend" },
    { href: "/founder/investors", title: "Investors", description: "Investor materials, updates, and pipeline.", badge: "No backend" }
  ];

  return (
    <>
      <PageHeading
        eyebrow="Founder Ops"
        title="Founder Command Center"
        subtitle="Planning, research, and investor support. Decision support only — the human decides and acts."
        action={<OSBadge tone="info">No backend yet</OSBadge>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modules.map((m) => (
          <ModuleCard key={m.href} {...m} />
        ))}
      </div>
    </>
  );
}
