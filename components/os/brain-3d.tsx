"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { OrgGraph, OrgNode } from "@/lib/brain/org-graph";

// three.js only via this ssr:false boundary — never on the server / in the home bundle base.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

// ---- 3 switchable color themes ----------------------------------------------
type Theme = { key: string; name: string; os: string; business: string; active: string; planned: string; agent: string; link: string; bg: string };
const THEMES: Theme[] = [
  { key: "purple", name: "Purple", os: "#f3e8ff", business: "#c084fc", active: "#a855f7", planned: "#6b7280", agent: "#8b5cf6", link: "#5b21b6", bg: "#0b0710" },
  { key: "blue", name: "Blue", os: "#dbeafe", business: "#60a5fa", active: "#3b82f6", planned: "#64748b", agent: "#22d3ee", link: "#1e3a8a", bg: "#070b14" },
  { key: "greenyellow", name: "Green / Yellow", os: "#ecfccb", business: "#eab308", active: "#84cc16", planned: "#6b7280", agent: "#22c55e", link: "#3f6212", bg: "#080f08" }
];
function colorFor(n: OrgNode, t: Theme): string {
  if (n.type === "os") return t.os;
  if (n.type === "business") return t.business;
  if (n.type === "agent") return t.agent;
  return n.status === "active" ? t.active : t.planned; // domain
}

function webglOK(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

const LS_THEME = "brain3d.theme";
const LS_NAMES = "brain3d.groupNames";
const LS_HIDDEN = "brain3d.hiddenGroups";

type State = { kind: "loading" } | { kind: "error"; msg: string } | { kind: "empty" } | { kind: "ready"; graph: OrgGraph };

export function Brain3D() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ pauseAnimation?: () => void; resumeAnimation?: () => void; zoomToFit?: (ms?: number, px?: number) => void } | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [size, setSize] = useState({ w: 800, h: 460 });
  const [note, setNote] = useState<string | null>(null);

  const [themeKey, setThemeKey] = useState("blue");
  const [names, setNames] = useState<Record<string, string>>({});   // groupId -> custom name
  const [hidden, setHidden] = useState<Record<string, boolean>>({}); // groupId -> hidden
  const [editing, setEditing] = useState<string | null>(null);
  const theme = THEMES.find((t) => t.key === themeKey) ?? THEMES[1];

  // load persisted prefs
  useEffect(() => {
    try {
      const t = localStorage.getItem(LS_THEME); if (t) setThemeKey(t);
      const n = localStorage.getItem(LS_NAMES); if (n) setNames(JSON.parse(n));
      const h = localStorage.getItem(LS_HIDDEN); if (h) setHidden(JSON.parse(h));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(LS_THEME, themeKey); } catch {} }, [themeKey]);
  useEffect(() => { try { localStorage.setItem(LS_NAMES, JSON.stringify(names)); } catch {} }, [names]);
  useEffect(() => { try { localStorage.setItem(LS_HIDDEN, JSON.stringify(hidden)); } catch {} }, [hidden]);

  // fetch the live graph (bounded, validated)
  useEffect(() => {
    if (!webglOK()) { setState({ kind: "error", msg: "3D graphics (WebGL) unavailable in this browser." }); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    (async () => {
      try {
        const res = await fetch("/api/brain/graph", { signal: ctrl.signal });
        if (!res.ok) { setState({ kind: "error", msg: `Could not load graph (${res.status}).` }); return; }
        const g = (await res.json()) as OrgGraph;
        if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.links)) { setState({ kind: "error", msg: "Malformed graph data." }); return; }
        if (g.nodes.length === 0) { setState({ kind: "empty" }); return; }
        setState({ kind: "ready", graph: g });
      } catch (e) {
        setState({ kind: "error", msg: (e as Error).name === "AbortError" ? "Timed out loading the graph." : "Failed to load the graph." });
      }
    })();
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [state.kind]);

  useEffect(() => {
    const onVis = () => { const fg = fgRef.current; if (!fg) return; if (document.hidden) fg.pauseAnimation?.(); else fg.resumeAnimation?.(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state.kind]);

  // groups present in the graph (id -> default label), preserving insertion order
  const groups = useMemo(() => {
    if (state.kind !== "ready") return [] as { id: string; label: string }[];
    const seen = new Map<string, string>();
    for (const n of state.graph.nodes) if (!seen.has(n.group)) seen.set(n.group, n.groupLabel);
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [state]);

  // graph filtered to visible groups (+ links between visible nodes)
  const graphData = useMemo(() => {
    if (state.kind !== "ready") return { nodes: [], links: [] };
    const nodes = state.graph.nodes.filter((n) => !hidden[n.group]);
    const ids = new Set(nodes.map((n) => n.id));
    const links = state.graph.links.filter((l) => ids.has(l.source as string) && ids.has(l.target as string));
    return { nodes, links };
  }, [state, hidden]);

  const shell = "mt-4 flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-sm text-neutral-400";
  if (state.kind === "loading") return <div className={shell} style={{ height: 460 }}>Loading the command center…</div>;
  if (state.kind === "error") return <div className={shell} style={{ height: 460 }}>{state.msg}</div>;
  if (state.kind === "empty") return <div className={shell} style={{ height: 460 }}>No businesses or agents yet.</div>;

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_240px]">
      {/* graph */}
      <div ref={wrapRef} className="relative overflow-hidden rounded-lg border border-neutral-800" style={{ height: 460, background: theme.bg }}>
        <ForceGraph3D
          ref={fgRef as never}
          width={size.w}
          height={size.h}
          graphData={graphData as never}
          backgroundColor={theme.bg}
          nodeLabel={(n: object) => `${(n as OrgNode).label} · ${(n as OrgNode).status}`}
          nodeVal={(n: object) => (n as OrgNode).val}
          nodeColor={(n: object) => colorFor(n as OrgNode, theme)}
          nodeOpacity={0.95}
          nodeRelSize={6}
          linkColor={() => theme.link}
          linkOpacity={0.55}
          linkWidth={0.6}
          warmupTicks={40}
          cooldownTicks={80}
          onEngineStop={() => fgRef.current?.zoomToFit?.(500, 60)}
          onNodeClick={(n: object) => {
            const node = n as OrgNode;
            if (node.href) router.push(node.href);
            else { setNote(`${node.label} — coming soon`); setTimeout(() => setNote(null), 2500); }
          }}
        />
        {note ? <div className="absolute bottom-3 left-3 rounded-md bg-neutral-900/90 px-3 py-1.5 text-xs text-neutral-200">{note}</div> : null}
        <div className="pointer-events-none absolute right-3 top-3 text-[11px] uppercase tracking-wider text-neutral-500">drag to rotate · click a node</div>
      </div>

      {/* controls */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">Theme</div>
        <div className="mb-4 flex gap-2">
          {THEMES.map((t) => (
            <button key={t.key} onClick={() => setThemeKey(t.key)} title={t.name}
              className={`h-6 w-6 rounded-full border ${themeKey === t.key ? "border-neutral-100" : "border-neutral-700"}`}
              style={{ background: t.active }} />
          ))}
        </div>
        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-400">
          <span>Groups</span>
          <button className="text-[10px] normal-case text-neutral-500 hover:text-neutral-300" onClick={() => setHidden({})}>show all</button>
        </div>
        <div className="max-h-[360px] space-y-1 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <input type="checkbox" checked={!hidden[g.id]} onChange={(e) => setHidden((h) => ({ ...h, [g.id]: !e.target.checked }))} className="accent-neutral-400" />
              {editing === g.id ? (
                <input autoFocus defaultValue={names[g.id] ?? g.label}
                  onBlur={(e) => { setNames((n) => ({ ...n, [g.id]: e.target.value.trim() || g.label })); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-100" />
              ) : (
                <button onClick={() => setEditing(g.id)} title="click to rename" className="flex-1 truncate text-left text-xs text-neutral-300 hover:text-neutral-100">
                  {names[g.id] ?? g.label}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-neutral-600">Click a name to rename it. Toggle a group to hide/show its nodes. Your choices are remembered.</p>
      </div>
    </div>
  );
}
