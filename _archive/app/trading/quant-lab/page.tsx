import { FlaskConical, GitBranch, TestTube2 } from "lucide-react";
import { OsWorkflowRunner } from "@/components/os-workflow-runner";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";

const researchQueue = [
  "London session breakout with ATR volatility filter",
  "Mean reversion after liquidity sweep",
  "Trend continuation with news blackout window"
];

export default function QuantLabPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trading / Quant Lab"
        title="Quant Lab"
        description="Strategy research bench for hypotheses, features, validation gates, and model discipline. COMING SOON: historical data loader and backtest engine."
        action={<Badge tone="amber">COMING SOON backtests</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Hypotheses" value={researchQueue.length} detail="Research queue only" />
        <StatCard label="Backtest engine" value="COMING SOON" detail="No performance claims yet" />
        <StatCard label="Approval" value="Manual" detail="Human review required" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Research Queue</h2>
          </div>
          <div className="space-y-3">
            {researchQueue.map((item, index) => (
              <div key={item} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Hypothesis {index + 1}</div>
                <div className="mt-1 font-medium">{item}</div>
              </div>
            ))}
          </div>
        </Panel>

        <OsWorkflowRunner
          workflow="quant-lab"
          buttonLabel="Run quant review"
          defaultInput={{ hypothesis: researchQueue[0], assetClass: "FX", status: "research-only" }}
          notePlaceholder="Paste hypothesis, constraints, target pairs, or risk rules..."
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Validation Gates</h2>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>Minimum sample size and out-of-sample split.</li>
            <li>Transaction costs, slippage, and spread assumptions.</li>
            <li>Drawdown, regime stability, and failure mode review.</li>
          </ul>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <TestTube2 className="h-4 w-4 text-command" />
            <h2 className="font-semibold">COMING SOON</h2>
          </div>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">Historical candle ingestion, walk-forward optimizer, notebook exports, and reproducible run records.</p>
        </Panel>
      </div>
    </>
  );
}
