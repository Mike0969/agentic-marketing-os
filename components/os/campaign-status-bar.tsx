"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, PauseCircle } from "lucide-react";
import { OSButton, OSTextarea } from "@/components/os/ui";
import type { StatusLine } from "@/lib/marketing/status-line";

const LEAVE = "Crina and the agents are working on it (about 2 minutes). You can leave this page; I'll notify you when it's ready.";

/** The one-sentence status at the top of every campaign, with what the admin can do right there. */
export function CampaignStatusBar({ campaignId, line, running }: { campaignId: string; line: StatusLine; running: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showRework, setShowRework] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // While the agents work: check every 8 s and refresh the page when the job has finished.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/job`).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { job?: { state?: string } | null } | null;
      if (body?.job && body.job.state !== "running") router.refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [running, campaignId, router]);

  async function call(key: string, url: string, payload: Record<string, unknown>, busyText: string) {
    setBusy(key);
    setMessage({ ok: true, text: busyText });
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; stage?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: body.error ?? `It did not start (HTTP ${res.status}).` });
        return null;
      }
      return body;
    } catch {
      setMessage({ ok: false, text: "Lost the connection. Reload the page in a minute to see where it is." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const startAgents = async () => {
    const ok = await call("start", `/api/marketing/campaigns/${campaignId}/start`, {}, "Sending to the agents…");
    if (ok) {
      setMessage({ ok: true, text: LEAVE });
      router.refresh();
    }
  };

  const tone =
    line.tone === "working" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-50" : line.tone === "needs_you" ? "border-amber-500/50 bg-amber-500/10 text-amber-50" : line.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-50" : "border-red-500/40 bg-red-500/10 text-red-50";
  const Icon = line.tone === "working" ? Loader2 : line.tone === "ok" ? CheckCircle2 : line.tone === "needs_you" ? AlertTriangle : PauseCircle;

  return (
    <div role="status" aria-live="polite" data-testid="campaign-status" className={`mb-5 rounded-md border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 ${line.tone === "working" ? "animate-spin" : ""}`} />
        <span className="font-medium">{line.text}</span>
        {line.at ? <span className="text-xs opacity-70">({line.at})</span> : null}
      </div>
      {line.actions.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {line.actions.includes("approve_plan") ? (
            <OSButton className="px-3 py-1.5 text-xs" disabled={busy !== null} onClick={async () => {
              const ok = await call("approve", `/api/marketing/campaigns/${campaignId}/plan-decision`, { decision: "yes", reason: "Approved by the admin over Jev's doubts." }, "Approving the plan…");
              if (ok) await startAgents();
            }}>Approve the plan anyway</OSButton>
          ) : null}
          {line.actions.includes("rework_plan") ? (
            <OSButton variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => setShowRework(!showRework)}>Rework the plan with my note</OSButton>
          ) : null}
          {line.actions.includes("start_agents") ? (
            <OSButton className="px-3 py-1.5 text-xs" disabled={busy !== null} onClick={startAgents}>Start the agents</OSButton>
          ) : null}
          {line.actions.includes("run_again") ? (
            <OSButton className="px-3 py-1.5 text-xs" disabled={busy !== null} onClick={async () => {
              const ok = await call("run", `/api/marketing/campaigns/${campaignId}/run`, { background: true }, "Sending to the agents…");
              if (ok) {
                setMessage({ ok: true, text: LEAVE });
                router.refresh();
              }
            }}>Run the agents again</OSButton>
          ) : null}
          {line.actions.includes("review_posts") ? (
            <a href="#posts" className="inline-flex items-center rounded-md border border-current px-3 py-1.5 text-xs">Review the posts below</a>
          ) : null}
        </div>
      ) : null}
      {showRework ? (
        <div className="mt-2 space-y-2">
          <OSTextarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder='e.g. "Leave aside the drivers for now; focus on why members should follow us."' aria-label="Your note for the plan" />
          <OSButton className="px-3 py-1.5 text-xs" disabled={busy !== null || !note.trim()} onClick={async () => {
            const ok = await call("rework", `/api/marketing/campaigns/${campaignId}/plan-decision`, { decision: "rework", reason: note.trim() }, "Crina is reworking the plan with your note (about a minute)…");
            if (ok) {
              setShowRework(false);
              setMessage({ ok: true, text: ok.stage === "plan_ready" ? "Plan reworked and cleared by Jev." : "Plan reworked; Jev still has doubts — see the plan below." });
              router.refresh();
            }
          }}>
            {busy === "rework" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Send the plan rework
          </OSButton>
        </div>
      ) : null}
      {message ? <p className={`mt-2 text-xs ${message.ok ? "opacity-80" : "text-red-200"}`}>{message.text}</p> : null}
    </div>
  );
}
