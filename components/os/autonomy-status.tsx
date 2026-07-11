import { OSBadge, OSPanel } from "@/components/os/ui";
import { computeReadiness, type Capability } from "@/lib/health/readiness";

// Operator-facing snapshot of whether the autonomous loop is actually live.
// Server component: reads config server-side via the pure readiness function
// (no secrets reach the browser — only labels, statuses and env names).

const overallTone = { autonomous: "ok", degraded: "warn", fallback: "danger" } as const;
const overallLabel = { autonomous: "Autonomous", degraded: "Degraded", fallback: "Fallback" } as const;

function rowTone(c: Capability): "ok" | "warn" | "danger" | "off" {
  if (c.status === "ready") return "ok";
  if (c.status === "disabled") return "off";
  return c.tier === "required" ? "danger" : "warn";
}

function rowMark(c: Capability): string {
  if (c.status === "ready") return "✓";
  if (c.status === "disabled") return "•";
  return "✗";
}

export function AutonomyStatus() {
  const report = computeReadiness(process.env as Record<string, string | undefined>);

  return (
    <OSPanel>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-neutral-100">Autonomy readiness</h3>
        <OSBadge tone={overallTone[report.overall]}>
          {overallLabel[report.overall]} · {report.requiredReady}/{report.requiredTotal} required
        </OSBadge>
      </div>
      <p className="mb-4 text-xs text-neutral-500">{report.summary} Run <code className="text-neutral-400">npm run preflight</code> for detail.</p>
      <div className="divide-y divide-neutral-800">
        {report.capabilities.map((c) => (
          <div key={c.key} className="flex items-start justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-200">
                <span className="mr-2 text-neutral-500">{rowMark(c)}</span>
                {c.label}
                {c.tier === "required" ? <span className="ml-2 text-[10px] uppercase tracking-wider text-neutral-600">required</span> : null}
              </div>
              <div className="truncate text-xs text-neutral-500">{c.detail}</div>
            </div>
            <OSBadge tone={rowTone(c)}>{c.status}</OSBadge>
          </div>
        ))}
      </div>
    </OSPanel>
  );
}
