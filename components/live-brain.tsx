"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Cpu, Radio, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui";
import type { AgentLiveState, AgentStatusEntry, AgentStatusSnapshot } from "@/lib/agents/agent-status";
import type { AgentSignal } from "@/lib/types";

const ringOrder = ["agent-competitor-intelligence", "agent-seo", "agent-content-creator", "agent-visual-video", "agent-publishing", "agent-analytics"];

const stateColor: Record<AgentLiveState, string> = {
  idle: "#94a3b8",
  running: "#3b82f6",
  success: "#10b981",
  fallback: "#f59e0b",
  error: "#f43f5e",
  "needs-approval": "#8b5cf6"
};

const stateLabel: Record<AgentLiveState, string> = {
  idle: "Idle",
  running: "Running",
  success: "Healthy",
  fallback: "Fallback",
  error: "Error",
  "needs-approval": "Needs you"
};

const cx = 410;
const cy = 300;
const radius = 215;

export function LiveBrain({ initial }: { initial: AgentStatusSnapshot }) {
  const [snapshot, setSnapshot] = useState<AgentStatusSnapshot>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.agents.find((agent) => agent.primary)?.agentId ?? initial.agents[0]?.agentId ?? null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/agents/status", { cache: "no-store" });
      if (response.ok) setSnapshot((await response.json()) as AgentStatusSnapshot);
    } catch {
      // transient; keep last snapshot
    }
  }, []);

  useEffect(() => {
    timer.current = setInterval(refresh, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    map.set("agent-crina", { x: cx, y: cy });
    const ring = ringOrder.filter((id) => snapshot.agents.some((agent) => agent.agentId === id));
    ring.forEach((id, index) => {
      const angle = (-90 + (index * 360) / Math.max(ring.length, 1)) * (Math.PI / 180);
      map.set(id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
    return map;
  }, [snapshot.agents]);

  function point(id: string) {
    return positions.get(id) ?? { x: cx, y: cy };
  }

  function effectiveState(agent: AgentStatusEntry): AgentLiveState {
    return agent.state;
  }

  async function actOnSignal(id: string, status: AgentSignal["status"]) {
    await fetch("/api/agent-signals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    refresh();
  }

  const selected = snapshot.agents.find((agent) => agent.agentId === selectedId) ?? null;
  const ringAgents = ringOrder.map((id) => snapshot.agents.find((agent) => agent.agentId === id)).filter(Boolean) as AgentStatusEntry[];
  const crina = snapshot.agents.find((agent) => agent.agentId === "agent-crina");
  const escalations = snapshot.agents.flatMap((agent) => agent.signals.filter((signal) => signal.status === "needs_approval"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{snapshot.agents.length} agents</Badge>
          <Badge tone={snapshot.totals.openSignals ? "amber" : "neutral"}>{snapshot.totals.openSignals} open signals</Badge>
          <Badge tone={snapshot.totals.needsApproval ? "red" : "neutral"}>{snapshot.totals.needsApproval} need you</Badge>
          <Badge tone="neutral">{snapshot.totals.pendingApprovals} pending approvals</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Radio className="h-3 w-3 animate-pulse text-emerald-500" /> live · refreshes 5s
          </span>
        </div>
        <span className="text-xs text-slate-400">Read-only monitor · agents run when you approve Crina&apos;s items in the Pipeline.</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        {/* Graph */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel dark:border-slate-800 dark:bg-slate-900">
          <svg viewBox="0 0 820 620" className="h-auto w-full" role="img" aria-label="Live agent brain">
            {/* Orchestration spokes */}
            {crina
              ? ringAgents.map((agent) => {
                  const p = point(agent.agentId);
                  return <line key={`spoke-${agent.agentId}`} x1={cx} y1={cy} x2={p.x} y2={p.y} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1.5} />;
                })
              : null}

            {/* Handoff pipeline; lit when source agent is active */}
            {ringAgents.map((agent, index) => {
              const from = point(agent.agentId);
              const next = ringAgents[(index + 1) % ringAgents.length];
              const to = index === ringAgents.length - 1 ? point("agent-crina") : point(next.agentId);
              const lit = ["running", "success"].includes(effectiveState(agent));
              return (
                <line
                  key={`flow-${agent.agentId}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={lit ? "#6366f1" : "#cbd5e1"}
                  strokeWidth={lit ? 3 : 1.5}
                  strokeOpacity={lit ? 0.7 : 0.35}
                />
              );
            })}

            {/* Nodes */}
            {snapshot.agents.map((agent) => {
              const p = point(agent.agentId);
              const state = effectiveState(agent);
              const isCrina = agent.agentId === "agent-crina";
              const r = isCrina ? 36 : 27;
              const color = stateColor[state];
              const alive = state === "running" || state === "needs-approval" || state === "error";
              const selectedRing = selectedId === agent.agentId;
              return (
                <g key={agent.agentId} className="cursor-pointer" onClick={() => setSelectedId(agent.agentId)}>
                  {alive ? <circle cx={p.x} cy={p.y} r={r + 8} fill={color} className="animate-ping" opacity={0.25} /> : null}
                  {selectedRing ? <circle cx={p.x} cy={p.y} r={r + 6} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 3" /> : null}
                  <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={isCrina ? "#facc15" : "#ffffff"} strokeWidth={isCrina ? 3 : 2} />
                  {agent.signals.length ? (
                    <>
                      <circle cx={p.x + r - 4} cy={p.y - r + 4} r={9} fill="#0f172a" />
                      <text x={p.x + r - 4} y={p.y - r + 7} textAnchor="middle" className="fill-white text-[10px] font-bold">
                        {agent.signals.length}
                      </text>
                    </>
                  ) : null}
                  <text x={p.x} y={p.y + (isCrina ? 5 : 4)} textAnchor="middle" className="fill-white text-[10px] font-bold">
                    {isCrina ? "CEO" : agent.agentName.split(" ")[0]}
                  </text>
                  <text x={p.x} y={p.y + r + 15} textAnchor="middle" className="fill-slate-600 text-[12px] font-medium dark:fill-slate-300">
                    {agent.agentName}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap gap-3 px-2 pb-1 text-xs">
            {(Object.keys(stateLabel) as AgentLiveState[]).map((state) => (
              <span key={state} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stateColor[state] }} />
                {stateLabel[state]}
              </span>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md text-white" style={{ backgroundColor: stateColor[effectiveState(selected)] }}>
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{selected.agentName}</h3>
                    <p className="text-sm text-slate-500">{selected.role}</p>
                  </div>
                </div>
                <Badge tone={selected.state === "error" || selected.state === "needs-approval" ? "red" : selected.state === "fallback" ? "amber" : selected.state === "success" ? "green" : "neutral"}>
                  {stateLabel[effectiveState(selected)]}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Model</div>
                  <div className="mt-0.5 truncate text-sm font-medium">{selected.lastRun?.model ?? selected.defaultModel ?? "—"}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <Clock className="h-3 w-3" /> Last latency
                  </div>
                  <div className="mt-0.5 text-sm font-medium">{selected.lastRun?.durationMs != null ? `${(selected.lastRun.durationMs / 1000).toFixed(1)}s` : "—"}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tokens</div>
                  <div className="mt-0.5 text-sm font-medium">{selected.lastRun?.tokensTotal ?? "n/a"}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-950">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Last run</div>
                  <div className="mt-0.5 truncate text-sm font-medium">{selected.lastRun ? selected.lastRun.status : "none"}</div>
                </div>
              </div>

              {selected.lastRun?.handoffTo ? (
                <div className="text-xs text-slate-500">
                  Handoff: <span className="font-medium">{selected.lastRun.handoffFrom ?? selected.agentName}</span> → <span className="font-medium">{selected.lastRun.handoffTo}</span>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Signals / issues</div>
                {selected.signals.length ? (
                  <div className="space-y-2">
                    {selected.signals.map((signal) => (
                      <div key={signal.id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-medium">
                            {signal.severity === "critical" ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500" /> : null}
                            {signal.kind.replaceAll("_", " ")}
                          </span>
                          <Badge tone={signal.status === "needs_approval" ? "red" : signal.severity === "warning" ? "amber" : "neutral"}>{signal.status.replace("_", " ")}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{signal.message}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => actOnSignal(signal.id, "resolved")}
                            className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-950 px-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950"
                          >
                            <Check className="h-3 w-3" /> Resolve
                          </button>
                          {signal.status !== "ack" ? (
                            <button
                              type="button"
                              onClick={() => actOnSignal(signal.id, "ack")}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              Ack
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No open signals. Agent is healthy.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Select an agent node to inspect it.</div>
          )}
        </div>
      </div>

      {/* Escalations → human decision */}
      {escalations.length ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/40">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <h3 className="font-semibold">Decisions for you ({escalations.length})</h3>
          </div>
          <div className="space-y-2">
            {escalations.map((signal) => (
              <div key={signal.id} className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm dark:bg-slate-900">
                <div className="min-w-0">
                  <div className="font-medium">{signal.agent_name} · {signal.kind.replaceAll("_", " ")}</div>
                  <div className="truncate text-xs text-slate-500">{signal.message}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => actOnSignal(signal.id, "resolved")} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-500">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button type="button" onClick={() => actOnSignal(signal.id, "ack")} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <X className="h-3.5 w-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
