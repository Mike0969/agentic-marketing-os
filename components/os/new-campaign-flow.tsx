"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, Loader2, Send, XCircle } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSTextarea } from "@/components/os/ui";
import { startAgents, type AgentStep } from "@/components/os/start-agents";

const PLATFORMS = ["LinkedIn", "Instagram", "X", "Facebook", "TikTok", "Blog"];

type StepState = "waiting" | "running" | "done" | "error" | "stopped";
type Plan = { title: string; summary: string; key_message: string; platforms: string[]; cta: string; objective: string };
type Jev = { ran: boolean; score: number | null; doubts: string | null; note: string | null } | null;

export function NewCampaignFlow({ brandName, brandId = null }: { brandName: string | null; brandId?: string | null }) {
  const [idea, setIdea] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [jev, setJev] = useState<Jev>(null);
  const [steps, setSteps] = useState<Record<"plan" | AgentStep, { state: StepState; detail?: string }>>({
    plan: { state: "waiting" },
    support: { state: "waiting" },
    makers: { state: "waiting" }
  });

  const setStep = (key: "plan" | AgentStep, state: StepState, detail?: string) => setSteps((current) => ({ ...current, [key]: { state, detail } }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStep("plan", "running");
    try {
      const res = await fetch("/api/marketing/campaigns/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, platforms, brand_id: brandId ?? undefined, start_date: start || undefined, end_date: end || undefined })
      });
      const body = (await res.json()) as { campaign_id?: string; stage?: string; plan?: Plan | null; jev?: Jev; error?: string | null };
      if (!res.ok || !body.campaign_id) throw new Error(body.error ?? "The campaign was not created.");
      setCampaignId(body.campaign_id);
      setPlan(body.plan ?? null);
      setJev(body.jev ?? null);
      if (!body.plan) {
        setStep("plan", "error", body.error ?? "Crina did not return a plan.");
        return;
      }
      if (body.stage === "plan_doubts") {
        setStep("plan", "stopped", "Jev still doubts the plan after 2 reworks. It waits for your look on Review.");
        return;
      }
      setStep("plan", "done", body.jev?.ran ? `Jev passed the plan (${body.jev.score?.toFixed(2)}).` : body.jev?.note ?? "Plan ready.");
      await startAgents(body.campaign_id, (step, state, detail) => setStep(step, state, detail));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setStep("plan", "error");
    } finally {
      setBusy(false);
    }
  }

  const started = steps.plan.state !== "waiting";

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <OSPanel>
        <form onSubmit={submit} className="space-y-4">
          <OSField label="Your idea" hint={`Write it the way you would tell a person. Crina plans the campaign for ${brandName ?? "your brand"}.`}>
            <OSTextarea
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="e.g. Show drivers in Dubai that with NexRide they keep the whole fare, no commission."
              rows={5}
              required
              disabled={started}
            />
          </OSField>
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">Platforms (optional; Crina picks if empty)</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => {
                const on = platforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    disabled={started}
                    onClick={() => setPlatforms((current) => (on ? current.filter((p) => p !== platform) : [...current, platform]))}
                    className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"}`}
                    aria-pressed={on}
                  >
                    {platform}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OSField label="Start date (optional)">
              <OSInput type="date" value={start} onChange={(event) => setStart(event.target.value)} disabled={started} />
            </OSField>
            <OSField label="End date (optional)">
              <OSInput type="date" value={end} onChange={(event) => setEnd(event.target.value)} disabled={started} />
            </OSField>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <OSButton type="submit" disabled={busy || started || idea.trim().length < 10}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Start campaign
          </OSButton>
          <p className="text-xs text-neutral-500">Nothing is posted. You review every part before anything goes to the schedule.</p>
        </form>
      </OSPanel>

      <OSPanel>
        <h2 className="text-lg font-semibold text-neutral-50">What happens now</h2>
        <ol className="mt-4 space-y-3">
          <StepRow title="Crina writes the plan, Jev checks it" step={steps.plan} />
          <StepRow title="SEO brief + what to measure (SEO, Analytics)" step={steps.support} />
          <StepRow title="Content Creator + Visual make the posts (Jev checks each)" step={steps.makers} />
        </ol>

        {plan ? (
          <div className="mt-5 rounded-md border border-neutral-800 bg-neutral-950/60 p-4 text-sm leading-6 text-neutral-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-neutral-100">{plan.title}</span>
              {jev?.ran ? <OSBadge tone={jev.doubts ? "warn" : "ok"}>Jev {jev.score?.toFixed(2)}</OSBadge> : jev?.note ? <OSBadge tone="off">{jev.note}</OSBadge> : null}
            </div>
            <p className="mt-2">{plan.summary || plan.objective}</p>
            <p className="mt-2"><span className="text-neutral-500">Key message:</span> {plan.key_message}</p>
            <p><span className="text-neutral-500">Platforms:</span> {plan.platforms.join(", ")} · <span className="text-neutral-500">CTA:</span> {plan.cta}</p>
            {jev?.doubts ? <p className="mt-2 text-amber-200">{jev.doubts}</p> : null}
          </div>
        ) : null}

        {campaignId ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/marketing/review/${campaignId}`} className="inline-flex items-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15">
              Open review
            </Link>
            <Link href="/marketing/pipeline" className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900">
              Watch in Pipeline
            </Link>
          </div>
        ) : null}
      </OSPanel>
    </div>
  );
}

function StepRow({ title, step }: { title: string; step: { state: StepState; detail?: string } }) {
  const icon =
    step.state === "running" ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> :
    step.state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
    step.state === "error" ? <XCircle className="h-4 w-4 text-red-400" /> :
    step.state === "stopped" ? <Circle className="h-4 w-4 text-amber-400" /> :
    <Circle className="h-4 w-4 text-neutral-600" />;
  return (
    <li className="flex gap-3">
      <span className="mt-1">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-neutral-100">{title}</span>
        {step.detail ? <span className="block text-sm leading-6 text-neutral-400">{step.detail}</span> : null}
      </span>
    </li>
  );
}
