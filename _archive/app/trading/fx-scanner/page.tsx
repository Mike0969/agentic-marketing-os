import { Activity, Clock, LineChart } from "lucide-react";
import { OsWorkflowRunner } from "@/components/os-workflow-runner";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";

const pairs = [
  { pair: "EUR/USD", state: "Range compression", bias: "Neutral", note: "Wait for London/New York break confirmation." },
  { pair: "GBP/USD", state: "Volatility watch", bias: "Neutral", note: "Avoid chasing without calendar context." },
  { pair: "USD/JPY", state: "Macro sensitive", bias: "Neutral", note: "COMING SOON live yields/news filter." },
  { pair: "XAU/USD", state: "High beta", bias: "Neutral", note: "Risk Governor review required before any future use." }
];

export default function FxScannerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trading / FX Scanner"
        title="FX Scanner"
        description="Hermes-assisted FX research board for watchlist triage. COMING SOON: live candles, spreads, broker positions, and economic calendar."
        action={<Badge tone="amber">COMING SOON live data</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Watchlist" value={pairs.length} detail="Static until market data connector is added" />
        <StatCard label="Execution" value="Disabled" detail="No live broker route exists" />
        <StatCard label="Refresh" value="Manual" detail="Run Hermes scanner when needed" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <LineChart className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Watchlist</h2>
          </div>
          <div className="space-y-3">
            {pairs.map((row) => (
              <div key={row.pair} className="grid gap-3 rounded-md border border-slate-200 p-3 text-sm md:grid-cols-[110px_1fr_100px] dark:border-slate-800">
                <div className="font-semibold">{row.pair}</div>
                <div>
                  <div className="font-medium">{row.state}</div>
                  <div className="mt-1 text-slate-500">{row.note}</div>
                </div>
                <Badge tone="neutral">{row.bias}</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-command" />
              <h2 className="font-semibold">Scanner Controls</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
              Hermes can produce a research scan from this static board now. Live prices and broker state are `COMING SOON`.
            </p>
          </Panel>
          <OsWorkflowRunner workflow="fx-scanner" buttonLabel="Run FX scan" defaultInput={{ pairs }} />
        </div>
      </div>

      <Panel className="mt-6">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Clock className="h-4 w-4 text-command" />
          Session filters, news calendar, spread guardrails, and broker read-only sync are COMING SOON.
        </div>
      </Panel>
    </>
  );
}
