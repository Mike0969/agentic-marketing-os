"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { OrgGraph, OrgNode } from "@/lib/brain/org-graph";

// three.js only via this ssr:false boundary — never on the server / in the home bundle base.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

const COLOR: Record<string, string> = {
  os: "#e5e7eb", business: "#f59e0b",
  active: "#22c55e", planned: "#6b7280",
  success: "#22c55e", fallback: "#f59e0b", error: "#ef4444", rate_limited: "#a78bfa", idle: "#6b7280"
};
function colorFor(n: OrgNode): string {
  if (n.type === "os") return COLOR.os;
  if (n.type === "business") return COLOR.business;
  return COLOR[n.status] ?? COLOR.planned;
}

function webglOK(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

type State = { kind: "loading" } | { kind: "error"; msg: string } | { kind: "empty" } | { kind: "ready"; graph: OrgGraph };

export function Brain3D() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ pauseAnimation?: () => void; resumeAnimation?: () => void; zoomToFit?: (ms?: number, px?: number) => void } | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [size, setSize] = useState({ w: 800, h: 460 });
  const [note, setNote] = useState<string | null>(null);

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

  // responsive sizing
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [state.kind]);

  // pause the render loop when the tab is hidden (perf / battery)
  useEffect(() => {
    const onVis = () => {
      const fg = fgRef.current;
      if (!fg) return;
      if (document.hidden) fg.pauseAnimation?.(); else fg.resumeAnimation?.();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state.kind]);

  const graphData = useMemo(() => (state.kind === "ready" ? state.graph : { nodes: [], links: [] }), [state]);

  const shell = "mt-4 flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-sm text-neutral-400";
  if (state.kind === "loading") return <div className={shell} style={{ height: 460 }}>Loading the command center…</div>;
  if (state.kind === "error") return <div className={shell} style={{ height: 460 }}>{state.msg}</div>;
  if (state.kind === "empty") return <div className={shell} style={{ height: 460 }}>No businesses or agents yet.</div>;

  return (
    <div ref={wrapRef} className="relative mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950" style={{ height: 460 }}>
      <ForceGraph3D
        ref={fgRef as never}
        width={size.w}
        height={size.h}
        graphData={graphData as never}
        backgroundColor="#0a0a0a"
        nodeLabel={(n: object) => `${(n as OrgNode).label} · ${(n as OrgNode).status}`}
        nodeVal={(n: object) => (n as OrgNode).val}
        nodeColor={(n: object) => colorFor(n as OrgNode)}
        nodeOpacity={0.95}
        nodeRelSize={6}
        linkColor={() => "#3f3f46"}
        linkOpacity={0.5}
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
      <div className="pointer-events-none absolute right-3 top-3 text-[11px] uppercase tracking-wider text-neutral-600">drag to rotate · click a node</div>
    </div>
  );
}
