"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronUp, Loader2, Pencil, Play, Save, Sparkles } from "lucide-react";
import { OSBadge, OSButton, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";
import type { Brand, Campaign } from "@/lib/types";

const PRESET_PLATFORMS = ["LinkedIn", "X", "Instagram", "TikTok", "Facebook", "YouTube", "Blog"];

type Schedule = {
  start: string;
  end: string;
  posts_per_day: string;
  timezone: string;
  from_hour: string;
  to_hour: string;
};

type IdeaBrief = {
  angle?: string;
  hook?: string;
  summary?: string;
  rationale?: string;
  platforms?: string[];
  primary_cta?: string;
  target_audience?: string;
  operator_notes?: string;
  schedule?: Schedule;
  fallback_used?: boolean;
};

type Draft = {
  title: string;
  objective: string;
  angle: string;
  hook: string;
  summary: string;
  rationale: string;
  target_audience: string;
  primary_cta: string;
  operator_notes: string;
  platforms: string[];
  schedule: Schedule;
};

const TIMEZONES = ["Europe (CET)", "UK (GMT)", "US East (ET)", "US West (PT)", "Gulf (GST)", "Asia (SGT)"];

function defaultSchedule(): Schedule {
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString().slice(0, 10);
  return { start, end, posts_per_day: "1", timezone: "Europe (CET)", from_hour: "09:00", to_hour: "18:00" };
}

function brief(c: Campaign): IdeaBrief {
  return (c.idea_brief as IdeaBrief) ?? {};
}

function toDraft(c: Campaign): Draft {
  const b = brief(c);
  return {
    title: c.title,
    objective: c.objective ?? "",
    angle: b.angle ?? "",
    hook: b.hook ?? "",
    summary: b.summary ?? "",
    rationale: b.rationale ?? "",
    target_audience: b.target_audience ?? "",
    primary_cta: b.primary_cta ?? "",
    operator_notes: b.operator_notes ?? "",
    platforms: b.platforms ?? [],
    schedule: { ...defaultSchedule(), ...(b.schedule ?? {}) }
  };
}

export function IdeasBoard({ brands, campaigns }: { brands: Brand[]; campaigns: Campaign[] }) {
  const [items, setItems] = useState(campaigns);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [proposing, setProposing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const brand = brands.find((b) => b.id === brandId) ?? null;
  const ideas = items.filter((c) => c.status === "idea" && c.brand_id === brandId);
  const running = items.filter((c) => c.status === "active" && c.brand_id === brandId);
  const archived = items.filter((c) => c.status === "archived" && c.brand_id === brandId);

  function patchItem(updated: Campaign) {
    setItems((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
  }

  async function propose() {
    if (!brandId) return;
    setProposing(true);
    setMessage(null);
    try {
      const r = await fetch("/api/marketing/campaigns/propose-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, count: 5, theme: notes.trim() || undefined })
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "Could not propose ideas.");
      setItems((cur) => [...(p.ideas ?? []), ...cur]);
      setMessage(`${p.fallback ? "FALLBACK — " : ""}Crina proposed ${(p.ideas ?? []).length} ideas. Review, edit, or refine — then choose.`);
      setNotes("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not propose ideas.");
    } finally {
      setProposing(false);
    }
  }

  async function decide(c: Campaign, action: "select" | "archive") {
    setBusyId(c.id);
    setMessage(null);
    try {
      const r = await fetch(`/api/marketing/campaigns/${c.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const p = await r.json();
      if (!r.ok || !p.campaign) throw new Error(p.error ?? "Action failed.");
      patchItem(p.campaign);
      setMessage(action === "select" ? `"${c.title}" selected — Crina will start it (per-platform posts come next).` : `"${c.title}" archived.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function runCampaign(c: Campaign) {
    setBusyId(c.id);
    setMessage(`Crina + Content + Visual are creating per-platform posts for "${c.title}" — this takes a minute or two (each post is reviewed by Crina before it reaches you)...`);
    try {
      if (c.status !== "active") {
        const decision = await fetch(`/api/marketing/campaigns/${c.id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "select" })
        });
        const decisionPayload = await decision.json();
        if (!decision.ok || !decisionPayload.campaign) throw new Error(decisionPayload.error ?? "Could not select this idea before running.");
        patchItem(decisionPayload.campaign);
      }
      const r = await fetch(`/api/marketing/campaigns/${c.id}/run`, { method: "POST" });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error ?? "Run failed.");
      setItems((cur) => cur.map((x) => (x.id === c.id ? { ...x, status: "active" } : x)));
      setMessage(`"${c.title}" is running — ${p.posts_created ?? 0} per-platform posts created. Open Ready to Post to review them.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(c: Campaign) {
    if (!draft) return;
    setBusyId(c.id);
    setMessage(null);
    try {
      const idea_brief = {
        ...brief(c),
        angle: draft.angle,
        hook: draft.hook,
        summary: draft.summary,
        rationale: draft.rationale,
        target_audience: draft.target_audience,
        primary_cta: draft.primary_cta,
        operator_notes: draft.operator_notes,
        platforms: draft.platforms,
        schedule: draft.schedule
      };
      const r = await fetch(`/api/marketing/campaigns/${c.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", title: draft.title, objective: draft.objective, idea_brief })
      });
      const p = await r.json();
      if (!r.ok || !p.campaign) throw new Error(p.error ?? "Save failed.");
      patchItem(p.campaign);
      setEditingId(null);
      setDraft(null);
      setMessage("Your edits were saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function refine(c: Campaign) {
    if (!remarks.trim()) return;
    setBusyId(c.id);
    setMessage(null);
    try {
      const r = await fetch(`/api/marketing/campaigns/${c.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: remarks.trim() })
      });
      const p = await r.json();
      if (!r.ok || !p.campaign) throw new Error(p.error ?? "Refine failed.");
      patchItem(p.campaign);
      setRefiningId(null);
      setRemarks("");
      setMessage(`${p.fallback ? "FALLBACK — " : ""}Crina revised the idea based on your remark.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refine failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <OSPanel className="border-cyan-500/20 bg-cyan-500/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="lg:w-64">
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">Brand</label>
            <OSSelect className="mt-2" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </OSSelect>
            {brand ? <p className="mt-2 text-xs text-neutral-500">Audience preset: {brand.target_audience || "not set"}</p> : null}
          </div>
          <div className="min-w-0 flex-1">
            <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">Your notes / source material (optional — Crina fills the rest)</label>
            <OSTextarea className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: a theme, angle, or link for Crina to consider. Leave blank and Crina proposes on her own." />
          </div>
          <OSButton onClick={propose} disabled={proposing || !brandId} className="shrink-0">
            {proposing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {proposing ? "Crina is thinking..." : "Propose ideas"}
          </OSButton>
        </div>
      </OSPanel>

      {message ? <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</div> : null}

      {running.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Working now</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {running.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-neutral-100">{c.title}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">Crina and the agents are working — the final package will appear in Ready to Post.</div>
                </div>
                <OSBadge tone="ok">Working</OSBadge>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Crina&apos;s ideas — review, edit, refine, choose</h3>
        {!ideas.length ? (
          <OSPanel>
            <p className="text-sm text-neutral-500">No ideas yet for this brand. Click &quot;Propose ideas&quot; and Crina will suggest campaigns.</p>
          </OSPanel>
        ) : (
          <div className="space-y-3">
            {ideas.map((c) => {
              const b = brief(c);
              const open = expanded[c.id];
              const isEditing = editingId === c.id && draft;
              const isRefining = refiningId === c.id;
              return (
                <OSPanel key={c.id} className="space-y-3">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <button type="button" className="min-w-0 text-left" onClick={() => setExpanded((cur) => ({ ...cur, [c.id]: !cur[c.id] }))}>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-semibold text-neutral-50">{c.title}</h4>
                        {b.fallback_used ? <OSBadge tone="warn">FALLBACK</OSBadge> : null}
                        {open ? <ChevronUp className="h-4 w-4 text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-neutral-500" />}
                      </div>
                      {b.hook ? <p className="mt-1 text-sm italic text-cyan-200">&ldquo;{b.hook}&rdquo;</p> : null}
                    </button>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <OSButton onClick={() => runCampaign(c)} disabled={busyId === c.id}>
                        {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Run
                      </OSButton>
                      <OSButton variant="secondary" onClick={() => { setRefiningId(isRefining ? null : c.id); setRemarks(""); setExpanded((cur) => ({ ...cur, [c.id]: true })); }} disabled={busyId === c.id}>
                        <Sparkles className="h-4 w-4" />
                        Refine
                      </OSButton>
                      <OSButton variant="secondary" onClick={() => { setEditingId(c.id); setDraft(toDraft(c)); setExpanded((cur) => ({ ...cur, [c.id]: true })); }} disabled={busyId === c.id}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </OSButton>
                      <OSButton variant="secondary" onClick={() => decide(c, "archive")} disabled={busyId === c.id}>
                        <Archive className="h-4 w-4" />
                        Archive
                      </OSButton>
                    </div>
                  </div>

                  {(b.platforms?.length || isEditing) && !isEditing ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(b.platforms ?? []).map((p) => (
                        <OSBadge key={p} tone="off">{p}</OSBadge>
                      ))}
                    </div>
                  ) : null}

                  {isRefining ? (
                    <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3">
                      <label className="text-xs font-medium uppercase tracking-wider text-cyan-300">Tell Crina what to change</label>
                      <OSTextarea className="mt-2" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. sharper hook, focus on Europe, less technical, add a proof point..." />
                      <div className="mt-2 flex gap-2">
                        <OSButton onClick={() => refine(c)} disabled={busyId === c.id || !remarks.trim()}>
                          {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Send to Crina
                        </OSButton>
                        <OSButton variant="secondary" onClick={() => setRefiningId(null)}>Cancel</OSButton>
                      </div>
                    </div>
                  ) : null}

                  {open && isEditing ? (
                    <div className="space-y-3 border-t border-neutral-800 pt-3">
                      <Field label="Title"><OSInput value={draft!.title} onChange={(e) => setDraft({ ...draft!, title: e.target.value })} /></Field>
                      <Field label="Hook"><OSInput value={draft!.hook} onChange={(e) => setDraft({ ...draft!, hook: e.target.value })} /></Field>
                      <Field label="Angle"><OSTextarea value={draft!.angle} onChange={(e) => setDraft({ ...draft!, angle: e.target.value })} /></Field>
                      <Field label="Summary"><OSTextarea value={draft!.summary} onChange={(e) => setDraft({ ...draft!, summary: e.target.value })} /></Field>
                      <Field label="Your view / notes"><OSTextarea value={draft!.operator_notes} onChange={(e) => setDraft({ ...draft!, operator_notes: e.target.value })} placeholder="Add your own angle, must-haves, or do-nots here." /></Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Audience"><OSInput value={draft!.target_audience} onChange={(e) => setDraft({ ...draft!, target_audience: e.target.value })} /></Field>
                        <Field label="CTA"><OSInput value={draft!.primary_cta} onChange={(e) => setDraft({ ...draft!, primary_cta: e.target.value })} /></Field>
                      </div>
                      <Field label="Platforms (tap to choose)">
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_PLATFORMS.map((p) => {
                            const on = draft!.platforms.includes(p);
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setDraft({ ...draft!, platforms: on ? draft!.platforms.filter((x) => x !== p) : [...draft!.platforms, p] })}
                                className={`rounded-md border px-2.5 py-1 text-xs transition ${on ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100" : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600"}`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      </Field>
                      <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                        <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Schedule (when to post)</div>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <Field label="Start"><OSInput type="date" value={draft!.schedule.start} onChange={(e) => setDraft({ ...draft!, schedule: { ...draft!.schedule, start: e.target.value } })} /></Field>
                          <Field label="End"><OSInput type="date" value={draft!.schedule.end} onChange={(e) => setDraft({ ...draft!, schedule: { ...draft!.schedule, end: e.target.value } })} /></Field>
                          <Field label="Posts / day"><OSInput type="number" min={1} max={10} value={draft!.schedule.posts_per_day} onChange={(e) => setDraft({ ...draft!, schedule: { ...draft!.schedule, posts_per_day: e.target.value } })} /></Field>
                          <Field label="Audience timezone"><OSSelect value={draft!.schedule.timezone} onChange={(e) => setDraft({ ...draft!, schedule: { ...draft!.schedule, timezone: e.target.value } })}>{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}</OSSelect></Field>
                          <Field label="Post from"><OSInput type="time" value={draft!.schedule.from_hour} onChange={(e) => setDraft({ ...draft!, schedule: { ...draft!.schedule, from_hour: e.target.value } })} /></Field>
                          <Field label="Post until"><OSInput type="time" value={draft!.schedule.to_hour} onChange={(e) => setDraft({ ...draft!, schedule: { ...draft!.schedule, to_hour: e.target.value } })} /></Field>
                        </div>
                        <p className="mt-2 text-xs text-neutral-600">No posts outside this local window — avoids posting during the audience&apos;s night.</p>
                      </div>
                      <div className="flex gap-2">
                        <OSButton onClick={() => saveEdit(c)} disabled={busyId === c.id}>
                          {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </OSButton>
                        <OSButton variant="secondary" onClick={() => { setEditingId(null); setDraft(null); }}>Cancel</OSButton>
                      </div>
                    </div>
                  ) : open ? (
                    <div className="grid gap-3 border-t border-neutral-800 pt-3 md:grid-cols-2">
                      <Detail label="Angle" value={b.angle} />
                      <Detail label="Summary" value={b.summary} />
                      <Detail label="Why it works" value={b.rationale} />
                      <Detail label="Audience" value={b.target_audience || brand?.target_audience} />
                      <Detail label="CTA" value={b.primary_cta} />
                      <Detail label="Objective" value={c.objective} />
                      <Detail label="Your view / notes" value={b.operator_notes} />
                      <Detail label="Schedule" value={b.schedule ? `${b.schedule.start} → ${b.schedule.end} · ${b.schedule.posts_per_day}/day · ${b.schedule.timezone} · ${b.schedule.from_hour}–${b.schedule.to_hour}` : undefined} />
                    </div>
                  ) : null}
                </OSPanel>
              );
            })}
          </div>
        )}
      </div>

      {archived.length ? (
        <div>
          <button type="button" className="text-sm text-neutral-500 hover:text-neutral-300" onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? "Hide" : "Show"} archived ideas ({archived.length})
          </button>
          {showArchive ? (
            <div className="mt-2 space-y-2">
              {archived.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="truncate text-sm text-neutral-400">{c.title}</div>
                  <OSButton variant="secondary" onClick={() => runCampaign(c)} disabled={busyId === c.id}>
                    <Play className="h-4 w-4" />
                    Run later
                  </OSButton>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-600">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
