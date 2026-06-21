import Link from "next/link";
import { ArrowRight, BadgeAlert, FlaskConical, LineChart, ShieldAlert } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";

const modules = [
  {
    href: "/trading/fx-scanner",
    title: "FX Scanner",
    description: "Watchlist, regime notes, setup candidates, invalidation levels, and risk warnings.",
    icon: LineChart
  },
  {
    href: "/trading/quant-lab",
    title: "Quant Lab",
    description: "Strategy hypothesis, feature design, validation gates, and backtest readiness.",
    icon: FlaskConical
  },
  {
    href: "/trading/risk-governor",
    title: "Risk Governor",
    description: "Exposure guardrails, drawdown rules, account risk posture, and human escalation.",
    icon: ShieldAlert
  }
];

export default function TradingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trading Research OS"
        title="Trading Control Tower"
        description="Research-first trading workspace for FX scanning, quant experimentation, and risk governance. No broker execution is connected."
        action={<Badge tone="amber">COMING SOON live broker/data</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Mode" value="Research" detail="No live orders, no broker execution" />
        <StatCard label="Hermes workflows" value="3" detail="Scanner, quant, risk review" />
        <StatCard label="Safety gates" value="Manual" detail="Human review before any future action" />
      </div>

      <Panel className="mt-6 border-l-4 border-l-amber-500">
        <div className="flex gap-3">
          <BadgeAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h2 className="font-semibold">Trading safety</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              These screens are for research and operating discipline only. Live market data, broker read-only sync, order execution, and kill-switch automation are explicitly marked `COMING SOON`.
            </p>
          </div>
        </div>
      </Panel>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.href} href={module.href} className="group block">
              <Panel className="h-full transition group-hover:-translate-y-0.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{module.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{module.description}</p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-command">
                  Open <ArrowRight className="h-4 w-4" />
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>
    </>
  );
}
