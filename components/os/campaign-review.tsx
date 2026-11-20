"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check, Loader2, Play, RotateCcw } from "lucide-react";
import { OSBadge, OSButton, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";
import { startAgents } from "@/components/os/start-agents";
import type { ContentItem } from "@/lib/types";

type Plan = { title: string; summary: string; objective: string; key_message: string; platforms: string[]; cta: string; target_audience: string; agent_tasks?: Record<string, string> };
type Jev = { ran: boolean; score: number | null; doubts: string | null; note: string | null } | null;
type Choice = { decision: "yes" | "rework" | null; reason: string };
type Draft = { title?: string; hook?: string; body?: string; cta?: string; hashtags?: string[] };
type BlockedInfo = { reason?: string; kind?: string; platform?: string; draft?: Draft | null; flagged?: string[]; judge_notes?: string; score?: number };

export function CampaignReview(props: {
  campaignId: string;
  stage: string;
  idea: string;
  plan: Plan | null;
  planJev: Jev;
  support: { seo: string | null; analytics: string | null };
  blocked: string | null;
  blockedKind: "safety" | "failed" | "moved";
  blockedInfo?: BlockedInfo | null;
  brand?: { id: string | null; options: Array<{ id: string; name: string }>; canChange: boolean };
  pending: ContentItem[];
  others: ContentItem[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [planChoice, setPlanChoice] = useState<Choice>({ decision: null, reason: "" });

  async function decidePlan() {
    if (!planChoice.decision) return;
    setBusy("plan");
    setMessage(null);
    const res = await fetch(`/api/marketing/campaigns/${props.campaignId}/plan-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planChoice)
    });
    const body = (await res.json().catch(() => ({}))) as { stage?: string; error?: string | null };
    setBusy(null);
    if (!res.ok) return setMessage(body.error ?? "Could not save your decision.");
    if (body.stage === "plan_ready") return runAgents();
    setMessage(body.stage === "plan_doubts" ? "Crina reworked the plan with your reason; Jev still has doubts. Have another look." : "Crina reworked the plan with your reason.");
    setPlanChoice({ decision: null, reason: "" });
    router.refresh();
  }

  async function runAgainAfterBlock() {
    setBusy("agents");
    setMessage("Content and visual agents are running again (a few minutes).");
    const res = await fetch(`/api/marketing/campaigns/${props.campaignId}/run`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string; posts?: Array<{ platform: string; title: string; blocked?: boolean }> };
    setBusy(null);
    if (!res.ok) return setMessage(body.error ?? "The run failed.");
    setMessage((body.posts ?? []).map((p) => `${p.platform}: ${p.blocked ? "blocked again by the safety check" : `ready: ${p.title}`}`).join(" · ") || "No posts came back.");
    router.refresh();
  }

  async function runAgents() {
    setBusy("agents");
    setMessage("Agents working: SEO + analytics, then content and visual (a few minutes).");
    const ok = await startAgents(props.campaignId, (step, state, detail) => {
      if (state === "error") setMessage(detail ?? "A step failed.");
      else if (state === "done" && step === "makers") setMessage(`Posts ready: ${detail}`);
    });
    setBusy(null);
    if (ok) router.refresh();
  }

  async function changeBrand(brandId: string) {
    setBusy("brand");
    setMessage(null);
    const res = await fetch(`/api/marketing/campaigns/${props.campaignId}/brand`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }) });
    const body = (await res.json().catch(() => ({}))) as { brand?: string; error?: string };
    setBusy(null);
    if (!res.ok) return setMessage(body.error ?? "Could not change the brand.");
    setMessage(`This campaign is now for ${body.brand}. Press "Run the agents again" to remake its posts for it.`);
    router.refresh();
  }

  async function runWith(payload: Record<string, unknown>, label: string) {
    setBusy("agents");
    setMessage(label);
    const res = await fetch(`/api/marketing/campaigns/${props.campaignId}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; posts?: Array<{ platform: string; title: string; blocked?: boolean }> };
    setBusy(null);
    if (!res.ok) return setMessage(body.error ?? "The run failed.");
    setMessage((body.posts ?? []).map((p) => `${p.platform}: ${p.blocked ? "blocked again by the safety check" : `ready for your review: ${p.title}`}`).join(" · ") || "No posts came back.");
    router.refresh();
  }

  const allDone = !props.pending.length && props.others.length > 0 && props.others.every((item) => item.approval_status === "approved");

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">{message}</div> : null}

      {props.brand?.options.length ? (
        <OSPanel className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-neutral-200">Brand</span>
          <OSSelect
            value={props.brand.id ?? ""}
            disabled={!props.brand.canChange || busy !== null}
            onChange={(e) => {
              const next = props.brand?.options.find((b) => b.id === e.target.value);
              if (next && window.confirm(`Move this campaign to ${next.name}?`)) void changeBrand(next.id);
            }}
            aria-label="Campaign brand"
            className="w-72"
          >
            {props.brand.options.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </OSSelect>
          <span className="text-xs text-neutral-500">{props.brand.canChange ? "You can change it until a post is published." : "A post is published, so the brand is fixed."}</span>
        </OSPanel>
      ) : null}

      <OSPanel>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-50">Plan</h2>
          {props.planJev?.ran ? <OSBadge tone={props.planJev.doubts ? "warn" : "ok"}>Jev {props.planJev.score?.toFixed(2)}</OSBadge> : props.planJev?.note ? <OSBadge tone="off">{props.planJev.note}</OSBadge> : null}
          {props.stage === "plan_doubts" ? <OSBadge tone="warn">Needs your look</OSBadge> : null}
        </div>
        <p className="mt-2 text-sm text-neutral-500">Your idea: “{props.idea}”</p>
        {props.plan ? (
          <div className="mt-3 grid gap-2 text-sm leading-6 text-neutral-300 md:grid-cols-2">
            <p className="md:col-span-2">{props.plan.summary || props.plan.objective}</p>
            <p><span className="text-neutral-500">Key message:</span> {props.plan.key_message}</p>
            <p><span className="text-neutral-500">Audience:</span> {props.plan.target_audience}</p>
            <p><span className="text-neutral-500">Platforms:</span> {props.plan.platforms.join(", ")}</p>
            <p><span className="text-neutral-500">CTA:</span> {props.plan.cta}</p>
            {props.support.seo ? <p><span className="text-neutral-500">SEO:</span> {props.support.seo}</p> : null}
            {props.support.analytics ? <p><span className="text-neutral-500">Measure:</span> {props.support.analytics}</p> : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">No plan yet.</p>
        )}
        {props.planJev?.doubts ? <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{props.planJev.doubts}</p> : null}

        {props.stage === "plan_doubts" && props.plan ? (
          <div className="mt-4">
            <PartChoice label="The plan" choice={planChoice} onChange={setPlanChoice} />
            <OSButton className="mt-3" onClick={decidePlan} disabled={busy !== null || !planChoice.decision || (planChoice.decision === "rework" && !planChoice.reason.trim())}>
              {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {planChoice.decision === "yes" ? "Yes: start the agents" : "Send"}
            </OSButton>
          </div>
        ) : null}
        {props.stage === "plan_ready" ? (
          <OSButton className="mt-4" onClick={runAgents} disabled={busy !== null}>
            {busy === "agents" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start the agents
          </OSButton>
        ) : null}
      </OSPanel>

      {props.blocked && !props.pending.length ? (
        props.blockedKind === "safety" && props.blockedInfo?.draft ? (
          <SafetyBlock info={props.blockedInfo} busy={busy !== null} running={busy === "agents"} onRework={(note) => runWith({ platform: props.blockedInfo?.platform, note }, "Crina's team is reworking the post with your note (a few minutes).")} onApprove={(draft) => runWith({ platform: props.blockedInfo?.platform, approvedDraft: draft }, "Your text is approved; the visual agent is making the image (a few minutes).")} onRunAgain={runAgainAfterBlock} />
        ) : (
        <OSPanel className="border-amber-500/40">
          <h2 className="text-lg font-semibold text-amber-100">{props.blockedKind === "failed" ? "The agents could not finish" : props.blockedKind === "moved" ? "Brand changed" : "Blocked by safety check"}</h2>
          <p className="mt-2 text-sm leading-6 text-amber-100">{props.blocked}</p>
          {props.blockedKind !== "moved" ? <p className="mt-1 text-sm text-neutral-400">{props.blockedKind === "failed" ? "Nothing was made. Try again when the model is available." : "Nothing was packaged or posted. Fix the cause, then run the agents again."}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {/Brands/.test(props.blocked) ? (
              <Link href="/marketing/brands" className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900">Open Brands</Link>
            ) : null}
            <OSButton onClick={runAgainAfterBlock} disabled={busy !== null}>
              {busy === "agents" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run the agents again
            </OSButton>
          </div>
        </OSPanel>
        )
      ) : null}

      {props.pending.map((item) => (
        <PostReview key={item.id} item={item} onDone={(text) => { setMessage(text); router.refresh(); }} />
      ))}

      {props.others.length ? (
        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Already decided</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {props.others.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 text-neutral-300">
                <OSBadge tone={item.approval_status === "approved" ? "ok" : "warn"}>{item.approval_status === "approved" ? "Yes" : item.workflow_stage === "rework" ? "Back with the agents" : item.approval_status}</OSBadge>
                <span>{item.platform}: {item.title}</span>
              </li>
            ))}
          </ul>
        </OSPanel>
      ) : null}

      {allDone ? (
        <Link href="/marketing/schedule" className="inline-flex items-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15">
          Next: scheduling and posting <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function PartChoice({ label, choice, onChange }: { label: string; choice: Choice; onChange: (choice: Choice) => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-100">{label}</span>
        <button type="button" onClick={() => onChange({ ...choice, decision: "yes" })} aria-pressed={choice.decision === "yes"} className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${choice.decision === "yes" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100" : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"}`}>
          <Check className="h-4 w-4" /> Yes
        </button>
        <button type="button" onClick={() => onChange({ ...choice, decision: "rework" })} aria-pressed={choice.decision === "rework"} className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${choice.decision === "rework" ? "border-amber-400/60 bg-amber-400/15 text-amber-100" : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"}`}>
          <RotateCcw className="h-4 w-4" /> Rework
        </button>
      </div>
      {choice.decision === "rework" ? (
        <OSTextarea className="mt-2" rows={2} placeholder="What should change? (saved to the learning notes)" value={choice.reason} onChange={(event) => onChange({ ...choice, reason: event.target.value })} aria-label={`${label} rework reason`} />
      ) : null}
    </div>
  );
}

function JevLine({ part }: { part: { ran: boolean; score: number | null; doubts: string | null; note: string | null } | null | undefined }) {
  if (!part) return null;
  if (!part.ran) return <p className="mt-2 text-xs text-neutral-500">{part.note ?? "Jev not run."}</p>;
  if (part.doubts) return <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-100">{part.doubts}</p>;
  return <p className="mt-2 text-xs text-emerald-300">Jev passed ({part.score?.toFixed(2)}).</p>;
}

function PostReview({ item, onDone }: { item: ContentItem; onDone: (message: string) => void }) {
  const [text, setText] = useState<Choice>({ decision: null, reason: "" });
  const [visual, setVisual] = useState<Choice>({ decision: null, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg = item.ready_package;
  const asset = pkg?.assets?.[0];
  const hasImage = Boolean(item.visual_asset_url && asset?.status === "generated");
  const ready = text.decision && visual.decision && (text.decision !== "rework" || text.reason.trim()) && (visual.decision !== "rework" || visual.reason.trim());

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/marketing/content-items/${item.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, visual })
    });
    const body = (await res.json().catch(() => ({}))) as { outcome?: string; parts?: string[]; error?: string };
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not save your review.");
    onDone(body.outcome === "approved" ? `${item.platform}: Yes on everything. It is in the schedule (posting stays off on the test copy).` : `${item.platform}: sent back to the agents (${(body.parts ?? []).join(" + ")}) with your reason.`);
  }

  return (
    <OSPanel>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">{item.platform}: {pkg?.title ?? item.title}</h2>
        {item.scheduled_at ? <OSBadge tone="off">Planned {new Date(item.scheduled_at).toLocaleString()}</OSBadge> : null}
      </div>
      {pkg?.fallback_used ? (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          FALLBACK: part of this post did not come from the agents ({(item.performance_summary ?? "").match(/FALLBACK\[([^\]]+)\]/)?.[1] ?? "see details"}). Treat it as a placeholder, not their work.
        </p>
      ) : null}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Text</h3>
          {item.hook ? <p className="mt-2 font-medium text-neutral-100">{item.hook}</p> : null}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{pkg?.text ?? item.body}</p>
          {pkg?.slides?.length ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-300">
              {pkg.slides.map((slide, index) => <li key={index}><span className="font-medium text-neutral-100">{slide.headline}</span>{slide.text ? ` — ${slide.text}` : ""}</li>)}
            </ol>
          ) : null}
          {item.CTA ? <p className="mt-2 text-sm text-cyan-200">CTA: {item.CTA}</p> : null}
          {pkg?.hashtags?.length ? <p className="mt-1 text-sm text-neutral-500">{pkg.hashtags.join(" ")}</p> : null}
          <JevLine part={pkg?.jev?.text} />
          <div className="mt-3"><PartChoice label="Text" choice={text} onChange={setText} /></div>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Visual</h3>
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.visual_asset_url!} alt={pkg?.alt_text ?? "Post visual"} className="mt-2 max-h-72 w-full rounded-md object-cover" />
          ) : (
            <p className="mt-2 rounded-md border border-dashed border-neutral-700 p-3 text-sm text-neutral-400">No image rendered: image generation needs an image key (OPENAI_API_KEY, HUGGINGFACE_API_KEY or REPLICATE_API_TOKEN). Judge the concept below.</p>
          )}
          {asset?.prompt ? <p className="mt-2 text-sm leading-6 text-neutral-300"><span className="text-neutral-500">Concept:</span> {asset.prompt}</p> : null}
          <JevLine part={pkg?.jev?.visual} />
          <div className="mt-3"><PartChoice label="Visual" choice={visual} onChange={setVisual} /></div>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <OSButton className="mt-4" onClick={send} disabled={busy || !ready}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {text.decision === "yes" && visual.decision === "yes" ? "Yes on both: next" : "Send"}
      </OSButton>
    </OSPanel>
  );
}

/** Highlights the flagged sentences inside a text. */
function Highlighted({ text, flagged }: { text: string; flagged: string[] }) {
  const parts: Array<{ t: string; hit: boolean }> = [];
  let rest = text;
  const needles = flagged.map((f) => f.trim()).filter((f) => f.length > 3);
  while (rest) {
    let best: { at: number; len: number } | null = null;
    for (const n of needles) {
      const at = rest.indexOf(n);
      if (at >= 0 && (!best || at < best.at)) best = { at, len: n.length };
    }
    if (!best) {
      parts.push({ t: rest, hit: false });
      break;
    }
    if (best.at) parts.push({ t: rest.slice(0, best.at), hit: false });
    parts.push({ t: rest.slice(best.at, best.at + best.len), hit: true });
    rest = rest.slice(best.at + best.len);
  }
  return <>{parts.map((p, i) => (p.hit ? <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-amber-50">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;
}

function SafetyBlock({ info, busy, running, onRework, onApprove, onRunAgain }: { info: BlockedInfo; busy: boolean; running: boolean; onRework: (note: string) => void; onApprove: (draft: Draft) => void; onRunAgain: () => void }) {
  const d = info.draft ?? {};
  const flagged = info.flagged ?? [];
  const [mode, setMode] = useState<"none" | "rework" | "edit">("none");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState({ title: d.title ?? "", hook: d.hook ?? "", body: d.body ?? "", cta: d.cta ?? "", hashtags: (d.hashtags ?? []).join(" ") });
  return (
    <OSPanel className="border-amber-500/40">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-amber-100">Blocked by safety check</h2>
        {info.platform ? <OSBadge tone="off">{info.platform}</OSBadge> : null}
        {typeof info.score === "number" ? <OSBadge tone="warn">{info.score}/100</OSBadge> : null}
      </div>
      {info.judge_notes ? <p className="mt-2 text-sm leading-6 text-amber-100">Reviewer: {info.judge_notes}</p> : null}
      {flagged.length ? (
        <div className="mt-3">
          <div className="text-sm font-medium text-neutral-200">Flagged sentence{flagged.length > 1 ? "s" : ""}:</div>
          <ul className="mt-1 space-y-1">
            {flagged.map((f, i) => (
              <li key={i} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-50">“{f}”</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">The reviewer did not point to a single sentence; its note above says why.</p>
      )}
      <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-sm leading-6 text-neutral-300">
        <div className="text-xs uppercase tracking-wider text-neutral-500">The blocked draft (not posted)</div>
        {d.title ? <div className="mt-1 font-medium text-neutral-100"><Highlighted text={d.title} flagged={flagged} /></div> : null}
        {d.hook ? <p className="mt-1"><Highlighted text={d.hook} flagged={flagged} /></p> : null}
        {d.body ? <p className="mt-1 whitespace-pre-wrap"><Highlighted text={d.body} flagged={flagged} /></p> : null}
        {d.cta ? <p className="mt-1"><span className="text-neutral-500">CTA:</span> <Highlighted text={d.cta} flagged={flagged} /></p> : null}
        {d.hashtags?.length ? <p className="mt-1 text-neutral-500">{d.hashtags.join(" ")}</p> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <OSButton variant={mode === "rework" ? "primary" : "secondary"} onClick={() => setMode(mode === "rework" ? "none" : "rework")} disabled={busy}>
          <RotateCcw className="h-4 w-4" /> Rework with my note
        </OSButton>
        <OSButton variant={mode === "edit" ? "primary" : "secondary"} onClick={() => setMode(mode === "edit" ? "none" : "edit")} disabled={busy}>
          <Check className="h-4 w-4" /> Edit and approve
        </OSButton>
        <OSButton variant="secondary" onClick={onRunAgain} disabled={busy}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run the agents again
        </OSButton>
      </div>
      {mode === "rework" ? (
        <div className="mt-3 space-y-2">
          <OSTextarea value={note} onChange={(e) => setNote(e.target.value)} placeholder='e.g. "Remove the 30% claim; say early riders get priority instead."' aria-label="Your note for the rework" rows={3} />
          <OSButton onClick={() => onRework(note.trim())} disabled={busy || !note.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Send the rework
          </OSButton>
        </div>
      ) : null}
      {mode === "edit" ? (
        <div className="mt-3 grid gap-2">
          <OSInput value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="Title" placeholder="Title" />
          <OSInput value={edit.hook} onChange={(e) => setEdit({ ...edit, hook: e.target.value })} aria-label="Hook" placeholder="Hook" />
          <OSTextarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} aria-label="Text" rows={8} />
          <OSInput value={edit.cta} onChange={(e) => setEdit({ ...edit, cta: e.target.value })} aria-label="CTA" placeholder="CTA" />
          <OSInput value={edit.hashtags} onChange={(e) => setEdit({ ...edit, hashtags: e.target.value })} aria-label="Hashtags" placeholder="#hashtags" />
          <p className="text-xs text-neutral-500">Approving sends your text on without the safety check (you are the reviewer). The visual agent then makes the image and the post comes back here for your final Yes.</p>
          <OSButton onClick={() => onApprove({ ...edit, hashtags: edit.hashtags.split(/\s+/).filter(Boolean) })} disabled={busy || !edit.body.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve my edited text
          </OSButton>
        </div>
      ) : null}
    </OSPanel>
  );
}
