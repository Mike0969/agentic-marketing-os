"use client";

import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { OSBadge, OSButton, OSInput, OSPanel } from "@/components/os/ui";

export function SeoLoopLauncher() {
  const [topic, setTopic] = useState("AI marketing infrastructure for GridFactory.io and Gulf-EL.com / NexRide");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runLoop() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/marketing/seo-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, model: "glm-5.2" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "SEO loop failed.");
      setMessage(`Sent to approvals after ${payload.loop_iterations ?? 1} Crina review round(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SEO loop failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <OSPanel className="mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <OSBadge tone="info">SEO Loop</OSBadge>
            <span className="text-xs uppercase tracking-wider text-neutral-500">Builder + Crina judge</span>
          </div>
          <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-neutral-500">Target topic</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <OSInput value={topic} onChange={(event) => setTopic(event.target.value)} disabled={running} />
            <OSButton onClick={runLoop} disabled={running || !topic.trim()} className="shrink-0">
              {running ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Search className="h-4 w-4" />}
              {running ? "Running..." : "Run SEO Loop"}
            </OSButton>
          </div>
          {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        </div>
      </div>
    </OSPanel>
  );
}
