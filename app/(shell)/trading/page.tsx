import { ModuleCard, OSBadge, PageHeading } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function TradingHome() {
  const modules = [
    { href: "/trading/fx-scanner", title: "FX Scanner", description: "FX majors vs USD — bias/strength signal table from Hermes analysis.", badge: "No backend" },
    { href: "/trading/quant-lab", title: "Quant Lab", description: "Research notes, strategy ideas, and backtest task tracking.", badge: "No backend" },
    { href: "/trading/risk-governor", title: "Risk Governor", description: "Exposure review and risk rules. Research/risk only — no broker orders.", badge: "No backend" }
  ];

  return (
    <>
      <PageHeading
        eyebrow="Trading OS"
        title="Trading Command Center"
        subtitle="FX, stocks, options — research and risk review only. No broker execution ever runs from here."
        action={<OSBadge tone="warn">No backend yet</OSBadge>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <ModuleCard key={m.href} {...m} />
        ))}
      </div>
    </>
  );
}
