"use client";

import { useState } from "react";
import { Ban, Loader2, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { Badge, buttonClass, inputClass } from "@/components/ui";
import type { AgentTarget, AgentTargetType } from "@/lib/types";
import type { TeamRunReport } from "@/lib/agents/team-runner";

const targetTypes: AgentTargetType[] = ["competitor", "topic", "platform", "brand"];

export function TeamControl({ initialTargets, initialReport }: { initialTargets: AgentTarget[]; initialReport: TeamRunReport | null }) {
  const [targets, setTargets] = useState<AgentTarget[]>(initialTargets);
  const [report, setReport] = useState<TeamRunReport | null>(initialReport);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<AgentTargetType>("competitor");

  async function runTeam() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/agents/team/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!response.ok) throw new Error(`Run failed (HTTP ${response.status}).`);
      setReport((await response.json()) as TeamRunReport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Team run failed.");
    } finally {
      setRunning(false);
    }
  }

  async function addTarget() {
    const label = newLabel.trim();
    if (!label) return;
    const response = await fetch("/api/agent-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, type: newType }) });
    if (response.ok) {
      const { target } = (await response.json()) as { target: AgentTarget };
      setTargets((prev) => [target, ...prev]);
      setNewLabel("");
    }
  }

  async function toggleTarget(target: AgentTarget) {
    const response = await fetch("/api/agent-targets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.id, active: !target.active }) });
    if (response.ok) {
      const { target: updated } = (await response.json()) as { target: AgentTarget };
      setTargets((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    }
  }

  async function removeTarget(id: string) {
    const response = await fetch(`/api/agent-targets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setTargets((prev) => prev.filter((item) => item.id !== id));
  }

  const synthesis = report?.synthesis as { headline?: string; executiveSummary?: string; keyMoves?: string[]; nextActions?: string[]; risks?: string[] } | null;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      {/* Run + report */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Parallel team run</h3>
            <p className="text-sm text-slate-500">Fan-out the specialists at once, then Crina synthesizes one report.</p>
          </div>
          <button type="button" onClick={runTeam} disabled={running} className={buttonClass}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? "Running…" : "Run team"}
          </button>
        </div>

        {error ? <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}

        {report ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={report.synthesisProvider === "hermes" ? "green" : "amber"}>{report.synthesisProvider}</Badge>
              <Badge tone="neutral">{report.observability.successes} live</Badge>
              <Badge tone={report.observability.fallbacks ? "amber" : "neutral"}>{report.observability.fallbacks} fallback</Badge>
              <Badge tone={report.observability.errors ? "red" : "neutral"}>{report.observability.errors} error</Badge>
              <Badge tone="blue">{(report.observability.totalDurationMs / 1000).toFixed(1)}s</Badge>
              <Badge tone="neutral">tokens: {report.observability.totalTokens ?? "n/a"}</Badge>
            </div>

            {synthesis ? (
              <div className="rounded-md bg-slate-50 p-4 dark:bg-slate-950">
                <div className="text-sm font-semibold">{synthesis.headline ?? "Synthesized report"}</div>
                {synthesis.executiveSummary ? <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{synthesis.executiveSummary}</p> : null}
                {synthesis.keyMoves?.length ? (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Key moves</div>
                    <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-400">{synthesis.keyMoves.map((move, index) => <li key={index}>• {move}</li>)}</ul>
                  </div>
                ) : null}
                {synthesis.nextActions?.length ? (
                  <div className="mt-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Next actions</div>
                    <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-400">{synthesis.nextActions.map((action, index) => <li key={index}>• {action}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Specialist outputs (fan-out)</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {report.agentOutputs.map((output) => (
                  <div key={output.agentId} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{output.agentName}</span>
                      <Badge tone={output.fallback ? "amber" : "green"}>{output.provider}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(output.durationMs / 1000).toFixed(1)}s · {output.model ?? "—"} · tokens {output.tokensTotal ?? "n/a"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString()} · {report.safety.note}
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            No team report yet. Click <span className="font-medium">Run team</span> to fan out the specialists and synthesize a report.
          </div>
        )}
      </div>

      {/* Targets */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Targets list</h3>
            <p className="text-sm text-slate-500">The editable list the team runs over (competitors, topics, platforms).</p>
          </div>
          <RefreshCw className="h-4 w-4 text-slate-400" />
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addTarget()}
            placeholder="Add a competitor, topic, or platform…"
            className={inputClass}
          />
          <select value={newType} onChange={(event) => setNewType(event.target.value as AgentTargetType)} className={clsx(inputClass, "sm:w-40")}>
            {targetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button type="button" onClick={addTarget} className={clsx(buttonClass, "sm:w-auto")}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {targets.length ? (
            targets.map((target) => (
              <div key={target.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx("truncate text-sm font-medium", !target.active && "text-slate-400 line-through")}>{target.label}</span>
                    <Badge tone="neutral">{target.type}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleTarget(target)}
                    className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    {target.active ? "Active" : "Paused"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTarget(target.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:hover:bg-rose-950"
                    aria-label="Remove target"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
              No targets yet. Add competitors or topics; the team run and the Hermes morning job will use this list.
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">
          <Ban className="h-3.5 w-3.5" />
          Team runs are read/draft only. Live posting stays disabled.
        </div>
      </div>
    </div>
  );
}
