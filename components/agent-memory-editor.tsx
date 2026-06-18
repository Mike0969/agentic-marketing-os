"use client";

import { useState } from "react";
import { Check, Loader2, NotebookPen } from "lucide-react";
import { clsx } from "clsx";
import { inputClass } from "@/components/ui";

/**
 * Per-agent memory editor. Loads/saves the agent's own brain file
 * (agent-<id>-memory.md) which is injected only into that agent's Hermes calls.
 * Collapsed by default; loads content on first open.
 */
export function AgentMemoryEditor({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setBusy(true);
      try {
        const response = await fetch(`/api/agent-memory?agentId=${encodeURIComponent(agentId)}`, { cache: "no-store" });
        if (response.ok) {
          const { content } = (await response.json()) as { content: string };
          setValue(content);
        }
      } finally {
        setLoaded(true);
        setBusy(false);
      }
    }
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const response = await fetch("/api/agent-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, content: value })
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          <NotebookPen className="h-3.5 w-3.5" /> Memory
        </span>
        <span className="text-xs text-slate-400">{open ? "hide" : "edit"}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {busy && !loaded ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
            </div>
          ) : (
            <>
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={5}
                placeholder="Notes, voice rules, winning phrases, do/don'ts for this agent. Injected only into this agent's prompts."
                className={clsx(inputClass, "text-sm")}
              />
              <div className="flex items-center justify-end gap-2">
                {saved ? <Check className="h-4 w-4 text-emerald-500" /> : null}
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save memory"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
