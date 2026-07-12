# PLAN — 3D Command Center brain on the home page

Feature: replace the flat home dashboard hero with an interactive **3D rotatable graph** of the live business — businesses, function domains, and agents — driven by real data, with click-to-navigate. Same governance; additive to routing.

## Spec

A native React 3D force-graph (Three.js via `react-force-graph-3d`, an npm dep — NOT an iframe/CDN) rendered on `/` (home). Nodes come from a live server endpoint that assembles the org from real data. Clicking a node navigates to the relevant tab. The existing slim nav stays (reversible compaction); the 3D graph becomes the home hero above the existing panels.

Out of scope: replacing the `/brain` graphify tab (that stays — it's the knowledge graph; this is the org/command graph), removing the nav entirely, mutating any business data, mobile-perfect 3D.

### Real structure to render (verified 2026-07-12 from Supabase)
- **Businesses (brands):** GridFactory.io, Gulf-EL.com / NexRide.
- **Agents (6):** Crina, SEO Agent, Content Creator Agent, Visual & Video Agent, Competitor Intelligence Agent, Publishing Agent — each with a live status derived from its latest `agent_runs` row.
- **Function domains (operator-named):** Marketing (active), Sales (active), Trading (planned), Investor platform (planned), Personal assistant (planned), Web assistants (planned), Mailing (active iff Resend configured, else planned), Ads (planned).

## Frozen interfaces

### 1. `GET /api/brain/graph` (server, admin/agent-gated like `/api/health`)
Returns JSON `{ nodes: Node[], links: Link[], generatedAt }` with NO secrets.
- `Node = { id: string, label: string, type: "os"|"business"|"domain"|"agent", status: "active"|"planned"|"success"|"fallback"|"error"|"idle", href: string|null, val: number }`.
- Assembly (deterministic, resilient — never throws; Supabase-down → still returns the static skeleton with `status:"planned"`/`idle`):
  - one `os` root node (`id:"os"`, `href:"/"`).
  - `business` nodes from `brands` (fallback to the two known brands if DB unavailable), `href:"/marketing"`.
  - `domain` nodes from a FROZEN list (the 8 above) with the stated active/planned status; `href`: Marketing→`/marketing`, Sales→`/sales`, others→`null` (planned).
  - `agent` nodes from `agents` (fallback to the 6 known names), status from the latest `agent_runs.status` per agent; `href:"/agents"`.
- `Link = { source: string, target: string }`: os→each business, os→each domain, Marketing-domain→each agent, each business→Marketing domain.
- `val` sizes: os 20, business 12, domain 8, agent 5.

### 2. `components/os/brain-3d.tsx` (client component, `"use client"`)
- Dynamically imports `react-force-graph-3d` (SSR-off via `next/dynamic`) so it never runs on the server.
- Fetches `/api/brain/graph` on mount; renders the 3D graph: node color by `type`, size by `val`, label on hover; auto-rotate on idle; drag-to-rotate/zoom.
- Node click → `router.push(node.href)` when `href` is set; planned nodes show a small "coming soon" label, no navigation.
- Graceful states: loading spinner; fetch error → a compact fallback panel (never a blank/crash).

### 3. Home page (`app/(shell)/page.tsx`)
- Render `<Brain3D />` as the hero (a tall panel, ~460px) ABOVE the existing domain cards / recent-runs / readiness panels (all retained). No other home logic changes.

### 4. Dependencies
- Add `react-force-graph-3d` and `three` to `package.json` (bundled by Next; no CDN). Pin versions. `npm install` committed via lockfile.

## Task DAG (single lane, Opus)

### T1 — `/api/brain/graph` + tests
- **Packet:** §1 verbatim.
- Do: implement the route (reuse `requireAgentAccessOrLocalhost`, `createServiceClient`/`isSupabaseConfigured`, latest-run status). Pure assembly split into a testable `lib/brain/org-graph.ts` (`buildOrgGraph(brands, agents, runsByAgent, env)` → `{nodes,links}`) so it is unit-tested without a DB.
- **Acceptance:** `lib/brain/org-graph.ts` tested (Node built-in runner): os+2 business+8 domain+6 agent nodes; every link's source/target exists in nodes (no dangling); planned domains have `href:null`; Supabase-empty input still yields the full skeleton; no secret values in output. `npx tsc --noEmit` green.
- **Must not touch:** `app/(shell)/page.tsx`, `components/`, `public/`.
- **Test command:** `node --test --experimental-strip-types tests/org-graph.test.ts`

### T2 — `Brain3D` component + home hero + deps
- **Packet:** §2 + §3 + §4 verbatim.
- Do: `npm install react-force-graph-3d three`; build `components/os/brain-3d.tsx` (dynamic, SSR-off); mount on home as hero.
- **Acceptance:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all green; `/` still builds; the component is `next/dynamic` with `ssr:false` (asserted by grep in a tiny check or by build success — no "window is not defined" at build).
- **Must not touch:** the API route, any route other than `app/(shell)/page.tsx`, other nav files.
- **Test command:** `npx tsc --noEmit && npm run lint && npm run build`

### T3 — runtime proof (browser)
- **Packet:** this section.
- Do: start dev; on the home page (authed/local), assert the 3D canvas mounts, `/api/brain/graph` returns the expected node/link counts, the graph has a WebGL canvas with >0 nodes, and clicking a business/marketing node navigates. Zero console errors.
- **Acceptance:** WebGL canvas present, node count matches the API, a node click routes, no console errors.
- **Must not touch:** source (verification only).
- **Test command:** browser drive + `curl -s localhost:PORT/api/brain/graph | jq '.nodes|length'`.

## Global acceptance
- tsc / lint / build green; `org-graph.ts` unit tests pass.
- `/api/brain/graph` returns a well-formed, secret-free, dangling-link-free graph, resilient to Supabase being down.
- The home page shows a rotatable 3D graph of the real org; nodes navigate; no console errors (browser-verified).
- Nothing outside `app/api/brain/`, `app/(shell)/page.tsx`, `components/os/brain-3d.tsx`, `lib/brain/`, `tests/org-graph.test.ts`, and `package.json`/lockfile is modified.
