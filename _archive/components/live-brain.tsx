"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Cpu, GitBranch, Radio, ShieldCheck, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui";
import type { AgentLiveState, AgentStatusEntry, AgentStatusSnapshot } from "@/lib/agents/agent-status";
import type { AgentSignal } from "@/lib/types";

const width = 860;
const height = 620;
const globe = { x: 430, y: 300, r: 245 };

const orbitOrder = ["agent-competitor-intelligence", "agent-seo", "agent-content-creator", "agent-visual-video", "agent-publishing", "agent-analytics"];

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

const shortName: Record<string, string> = {
  "agent-crina": "Crina",
  "agent-seo": "SEO",
  "agent-content-creator": "Content",
  "agent-visual-video": "Visual",
  "agent-competitor-intelligence": "Intel",
  "agent-publishing": "Drafts",
  "agent-analytics": "Data"
};

function signalState(signal: AgentSignal): AgentLiveState {
  if (signal.status === "needs_approval") return "needs-approval";
  if (signal.severity === "critical") return "error";
  if (signal.severity === "warning") return "fallback";
  return "success";
}

function runState(status: AgentStatusEntry["lastRun"]): AgentLiveState {
  if (!status) return "idle";
  if (status.status === "error") return "error";
  if (status.status === "fallback") return "fallback";
  return "success";
}

function angleFor(agentId: string) {
  const index = Math.max(orbitOrder.indexOf(agentId), 0);
  return -Math.PI / 2 + (index * Math.PI * 2) / Math.max(orbitOrder.length, 1);
}

function pointOnOrbit(agent: AgentStatusEntry, tick: number) {
  if (agent.primary) return { x: globe.x, y: globe.y };
  const base = angleFor(agent.agentId);
  const index = Math.max(orbitOrder.indexOf(agent.agentId), 0);
  const drift = tick * (0.0024 + index * 0.00028);
  const pulse = Math.sin(tick * 0.018 + index) * 10;
  const rx = globe.r * 0.68 + pulse;
  const ry = globe.r * 0.49 + Math.cos(tick * 0.014 + index) * 8;
  return {
    x: globe.x + Math.cos(base + drift) * rx,
    y: globe.y + Math.sin(base + drift) * ry
  };
}

function satellitePoint(origin: { x: number; y: number }, index: number, tick: number) {
  const angle = tick * 0.018 + index * 1.45;
  return {
    x: origin.x + Math.cos(angle) * 42,
    y: origin.y + Math.sin(angle) * 32
  };
}

function toneForState(state: AgentLiveState): "neutral" | "green" | "blue" | "amber" | "red" {
  if (state === "success") return "green";
  if (state === "running") return "blue";
  if (state === "fallback") return "amber";
  if (state === "error" || state === "needs-approval") return "red";
  return "neutral";
}

export function LiveBrain({ initial }: { initial: AgentStatusSnapshot }) {
  const [snapshot, setSnapshot] = useState<AgentStatusSnapshot>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.agents.find((agent) => agent.primary)?.agentId ?? initial.agents[0]?.agentId ?? null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/agents/status", { cache: "no-store" });
      if (response.ok) setSnapshot((await response.json()) as AgentStatusSnapshot);
    } catch {
      // Keep the last healthy snapshot on screen.
    }
  }, []);

  useEffect(() => {
    const poll = setInterval(refresh, 5000);
    return () => clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    let frame = 0;
    let animation = 0;
    const animate = () => {
      frame += 1;
      setTick(frame);
      animation = requestAnimationFrame(animate);
    };
    animation = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animation);
  }, []);

  const selected = snapshot.agents.find((agent) => agent.agentId === selectedId) ?? null;
  const crina = snapshot.agents.find((agent) => agent.primary);
  const positions = new Map(snapshot.agents.map((agent) => [agent.agentId, pointOnOrbit(agent, tick)]));
  const escalations = snapshot.agents.flatMap((agent) => agent.signals.filter((signal) => signal.status === "needs_approval"));
  const satellites = snapshot.agents.reduce((count, agent) => count + (agent.lastRun ? 1 : 0) + agent.signals.length, 0);

  async function actOnSignal(id: string, status: AgentSignal["status"]) {
    await fetch("/api/agent-signals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{snapshot.agents.length} agents</Badge>
          <Badge tone="neutral">{satellites} satellites</Badge>
          <Badge tone={snapshot.totals.openSignals ? "amber" : "neutral"}>{snapshot.totals.openSignals} open signals</Badge>
          <Badge tone={snapshot.totals.needsApproval ? "red" : "neutral"}>{snapshot.totals.needsApproval} need you</Badge>
          <Badge tone="neutral">{snapshot.totals.pendingApprovals} pending approvals</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Radio className="h-3 w-3 animate-pulse text-emerald-500" /> live · refreshes 5s
          </span>
        </div>
        <span className="text-xs text-slate-400">Click an agent inside the live brain to inspect status, model, runs, tokens, and signals.</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-command" />
                <h3 className="font-semibold">Live agent brain</h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <GitBranch className="h-3.5 w-3.5" /> Registry agents orbit Crina. Runs and signals stay attached.
              </div>
            </div>
          </div>

          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full bg-slate-50 dark:bg-slate-950" role="img" aria-label="Live agent brain globe">
            <defs>
              <radialGradient id="brainGlobe" cx="50%" cy="45%" r="62%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="42%" stopColor="#eef2ff" />
                <stop offset="78%" stopColor="#dbeafe" />
                <stop offset="100%" stopColor="#bfdbfe" />
              </radialGradient>
              <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <clipPath id="brainClip">
                <circle cx={globe.x} cy={globe.y} r={globe.r} />
              </clipPath>
            </defs>

            <rect x="0" y="0" width={width} height={height} fill="transparent" />
            <circle cx={globe.x} cy={globe.y} r={globe.r + 18} fill="#e0f2fe" opacity="0.32" />
            <circle cx={globe.x} cy={globe.y} r={globe.r} fill="url(#brainGlobe)" stroke="#d1d5db" strokeWidth="1.5" />

            <g clipPath="url(#brainClip)">
              {[0.32, 0.54, 0.76].map((scale) => (
                <ellipse key={scale} cx={globe.x} cy={globe.y} rx={globe.r * scale} ry={globe.r * 0.86} fill="none" stroke="#93c5fd" strokeOpacity="0.22" strokeDasharray="4 9" />
              ))}
              {[0.38, 0.62, 0.86].map((scale) => (
                <ellipse key={scale} cx={globe.x} cy={globe.y} rx={globe.r * 0.92} ry={globe.r * scale} fill="none" stroke="#93c5fd" strokeOpacity="0.18" strokeDasharray="5 10" />
              ))}
              <path d={`M ${globe.x - globe.r} ${globe.y} C ${globe.x - 110} ${globe.y - 42}, ${globe.x + 110} ${globe.y + 42}, ${globe.x + globe.r} ${globe.y}`} fill="none" stroke="#60a5fa" strokeOpacity="0.22" />
              <path d={`M ${globe.x - globe.r} ${globe.y + 44} C ${globe.x - 90} ${globe.y + 12}, ${globe.x + 90} ${globe.y - 12}, ${globe.x + globe.r} ${globe.y + 44}`} fill="none" stroke="#60a5fa" strokeOpacity="0.16" />

              {crina
                ? snapshot.agents
                    .filter((agent) => !agent.primary)
                    .map((agent) => {
                      const p = positions.get(agent.agentId)!;
                      return <line key={`link-${agent.agentId}`} x1={globe.x} y1={globe.y} x2={p.x} y2={p.y} stroke="#64748b" strokeOpacity="0.24" strokeWidth="1.4" />;
                    })
                : null}

              {snapshot.agents.map((agent) => {
                const p = positions.get(agent.agentId)!;
                const color = stateColor[agent.state];
                const isSelected = selectedId === agent.agentId;
                const alive = agent.state === "running" || agent.state === "needs-approval" || agent.state === "error" || agent.state === "fallback";
                const radius = agent.primary ? 42 : 31;
                const run = agent.lastRun ? satellitePoint(p, 0, tick) : null;

                return (
                  <g key={agent.agentId}>
                    {run ? (
                      <>
                        <line x1={p.x} y1={p.y} x2={run.x} y2={run.y} stroke={stateColor[runState(agent.lastRun)]} strokeOpacity="0.35" strokeDasharray="2 5" />
                        <circle cx={run.x} cy={run.y} r="8" fill="#ffffff" stroke={stateColor[runState(agent.lastRun)]} strokeWidth="2" />
                      </>
                    ) : null}

                    {agent.signals.map((signal, index) => {
                      const s = satellitePoint(p, index + 1, tick);
                      const signalColor = stateColor[signalState(signal)];
                      return (
                        <g key={signal.id}>
                          <line x1={p.x} y1={p.y} x2={s.x} y2={s.y} stroke={signalColor} strokeOpacity="0.4" strokeDasharray="2 5" />
                          <circle cx={s.x} cy={s.y} r={signal.status === "needs_approval" ? 10 : 7} fill="#ffffff" stroke={signalColor} strokeWidth="2" />
                          <text x={s.x} y={s.y + 3} textAnchor="middle" className="pointer-events-none fill-slate-700 text-[10px] font-bold">
                            !
                          </text>
                        </g>
                      );
                    })}

                    {alive ? <circle cx={p.x} cy={p.y} r={radius + 18} fill={color} opacity={0.12 + Math.sin(tick / 18) * 0.04} /> : null}
                    {isSelected ? <circle cx={p.x} cy={p.y} r={radius + 9} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="6 5" /> : null}
                    <g className="cursor-pointer" onClick={() => setSelectedId(agent.agentId)}>
                      <circle cx={p.x} cy={p.y} r={radius} fill={color} stroke={agent.primary ? "#facc15" : "#ffffff"} strokeWidth={agent.primary ? 3 : 2} filter={alive || isSelected ? "url(#softGlow)" : undefined} />
                      <text x={p.x} y={p.y + 4} textAnchor="middle" className="pointer-events-none fill-white text-[10px] font-bold">
                        {shortName[agent.agentId] ?? agent.agentName.slice(0, 7)}
                      </text>
                    </g>
                    <text x={p.x} y={p.y + radius + 17} textAnchor="middle" className="pointer-events-none fill-slate-700 text-[12px] font-semibold dark:fill-slate-200">
                      {agent.agentName}
                    </text>
                  </g>
                );
              })}
            </g>

            <circle cx={globe.x} cy={globe.y} r={globe.r} fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" />
          </svg>

          <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-xs dark:border-slate-800">
            {(Object.keys(stateLabel) as AgentLiveState[]).map((state) => (
              <span key={state} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stateColor[state] }} />
                {stateLabel[state]}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md text-white" style={{ backgroundColor: stateColor[selected.state] }}>
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{selected.agentName}</h3>
                    <p className="text-sm text-slate-500">{selected.role}</p>
                  </div>
                </div>
                <Badge tone={toneForState(selected.state)}>{stateLabel[selected.state]}</Badge>
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
                <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                  Handoff: <span className="font-semibold">{selected.lastRun.handoffFrom ?? selected.agentName}</span> → <span className="font-semibold">{selected.lastRun.handoffTo}</span>
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
                  <div className="font-medium">
                    {signal.agent_name} · {signal.kind.replaceAll("_", " ")}
                  </div>
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
