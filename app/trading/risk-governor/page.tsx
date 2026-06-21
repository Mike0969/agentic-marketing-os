import { BadgeAlert, ShieldAlert, ShieldCheck } from "lucide-react";
import { OsWorkflowRunner } from "@/components/os-workflow-runner";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";

const guardrails = [
  { label: "Daily loss stop", value: "Manual", tone: "amber" as const },
  { label: "Max correlated FX exposure", value: "COMING SOON", tone: "amber" as const },
  { label: "Broker sync", value: "Not connected", tone: "red" as const },
  { label: "Kill switch", value: "COMING SOON", tone: "amber" as const }
];

export default function RiskGovernorPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trading / Risk Governor"
        title="Risk Governor"
        description="Risk posture screen for exposure discipline, drawdown limits, and operational guardrails. This does not approve live trading."
        action={<Badge tone="red">No broker authority</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {guardrails.map((item) => (
          <Panel key={item.label}>
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{item.label}</div>
            <div className="mt-3">
              <Badge tone={item.tone}>{item.value}</Badge>
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel className="border-l-4 border-l-amber-500">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h2 className="font-semibold">Current Risk State</h2>
          </div>
          <div className="grid gap-3">
            <StatCard label="Portfolio exposure" value="COMING SOON" detail="Requires broker read-only connection" />
            <StatCard label="Open orders" value="Disabled" detail="No execution connector exists" />
            <StatCard label="Escalation" value="Manual" detail="Founder must review any future live action" />
          </div>
        </Panel>

        <OsWorkflowRunner
          workflow="risk-governor"
          buttonLabel="Run risk review"
          defaultInput={{ accountMode: "research-only", brokerConnected: false, liveExecution: false }}
          notePlaceholder="Paste exposure, drawdown, or planned strategy context..."
        />
      </div>

      <Panel className="mt-6">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-command" />
          <div>
            <h2 className="font-semibold">Operating rule</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Any future broker connection must start read-only. Live order placement, position closing, and automated risk kill switches remain `COMING SOON` until explicit safety gates exist.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
