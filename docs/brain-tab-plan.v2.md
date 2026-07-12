# PLAN.v2 — Brain tab (embed the business-brain knowledge graph)

Supersedes brain-tab-plan.md. Sol round-1 findings F1–F5 folded in. Verified: the repo currently sets **no CSP** in `middleware.ts` / `next.config.ts`.

Feature: a `/brain` tab in the OS dashboard showing the cross-venture knowledge graph. Read-only, additive, no change to the marketing loop.

## Key design decision (F1+F4): vendor vis-network, no CDN

graphify's `graph.html` loads `vis-network` from unpkg. That creates a CDN/CSP/blank-graph risk AND forces the insecure `allow-same-origin` sandbox. Instead we **vendor the pinned bundle locally**: download `vis-network@9.1.6` UMD once, verify it against the SRI hash already in graph.html (`sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1`), commit it at `public/brain/vendor/vis-network.min.js`, and have the sync script rewrite graph.html's `<script>` to point at that local path. Result: fully self-contained, works offline and under any future CSP, and the iframe can use `sandbox="allow-scripts"` WITHOUT `allow-same-origin` (F1) — the frame gets an opaque origin, cannot touch the parent admin origin, yet still loads its own same-origin static script and renders.

## Frozen interfaces

### 1. `public/brain/vendor/vis-network.min.js` (committed, verified)
- Exactly `vis-network@9.1.6` UMD standalone, its sha384 equal to the SRI above. Committed once; never edited by the sync.

### 2. `scripts/sync-brain-graph.mjs` + `npm run brain:graph`
- Source: `path.join(process.env.BUSINESS_BRAIN_DIR ?? path.join(process.cwd(), "..", "business-brain"), "graphify-out", "graph.html")`.
- Dest dir: `public/brain/` (canonically resolved; refuse if `public/brain` or `public/brain/graph.html` is a symlink — F5 write-boundary).
- **Validation before any write (F5):** source must be a regular file, ≥ 50 000 bytes, containing both `vis.Network` and `id="graph"`. Any failure → print the reason + expected path, exit 1, **write nothing** (a stale valid snapshot beats a broken one).
- **Vendor guard:** `public/brain/vendor/vis-network.min.js` must exist; else exit 1 with the one-time download instruction. (The sync never downloads.)
- **Transform:** replace the whole unpkg `<script ...vis-network...></script>` tag with `<script src="/brain/vendor/vis-network.min.js"></script>`; assert the unpkg URL is gone and the local src is present in the output, else exit 1 (no write).
- **Atomic write (F5):** write `graph.html` and `meta.json` to temp files in `public/brain/`, then `rename` both into place only after both are staged — never leave new graph.html with stale meta.json. `meta.json` = `{ syncedAt: ISO, source: <abs> }`.
- On success: print `synced <bytes> bytes`, exit 0. Writes nothing outside `public/brain/` (never the vendor file, never the source).

### 3. `app/(shell)/brain/page.tsx` (server component)
- **No runtime `fs` detection (F2).** The snapshot is committed, so it is always present in the deployed static output. The page unconditionally renders `PageHeading` ("Brain" + subtitle) and a full-height iframe: `src="/brain/graph.html"`, `title="Business Brain knowledge graph"`, `sandbox="allow-scripts"` (NO allow-same-origin — F1), tall panel styling. A short caption links the refresh command.
- `meta.json` last-synced time is shown only if a build-time static import succeeds; otherwise the caption omits it (no fs, no crash).

### 4. Nav
- Add `{ href: "/brain", label: "Brain", icon: Brain }` (lucide `Brain`) to `nav` in `components/os/os-shell.tsx`, after Agents.

## Task DAG (single lane, Opus)

### T1 — vendor + sync script
- **Packet:** §1 + §2 verbatim.
- Do: download vis-network@9.1.6 UMD, verify sha384 == the SRI, commit to `public/brain/vendor/`. Implement `scripts/sync-brain-graph.mjs` per §2 + npm script. Run it to produce the committed `public/brain/graph.html` + `meta.json`.
- **Acceptance:** vendored file's `shasum -b -a 384 | xxd`-derived base64 equals the SRI; `graph.html` contains `/brain/vendor/vis-network.min.js` and NOT `unpkg.com`; a run with `BUSINESS_BRAIN_DIR=/nonexistent` exits 1 and leaves the existing `graph.html`/`meta.json` byte-identical (assert with pre/post sha); a run pointed at a 10-byte fake source exits 1 and writes nothing.
- **Must not touch:** `app/`, `components/`, any file outside `scripts/sync-brain-graph.mjs`, `package.json`, `public/brain/`.
- **Test command:** `node scripts/test-brain-sync.mjs` (a small node:test file asserting the above with temp fixtures).

### T2 — page + nav
- **Packet:** §3 + §4 verbatim.
- Do: `app/(shell)/brain/page.tsx` and the nav entry.
- **Acceptance:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all green; `/brain` appears in the build route list; nav array contains the Brain entry; the iframe tag has `sandbox="allow-scripts"` and no `allow-same-origin`.
- **Must not touch:** `scripts/`, `public/`, any route other than `app/(shell)/brain/`, any nav file other than `os-shell.tsx`.
- **Test command:** `npx tsc --noEmit && npm run lint && npm run build`

### T3 — runtime proof (F4: prove the graph actually renders)
- **Packet:** this section.
- Do: start dev; load `/brain`; drive the iframe in a real browser and assert the graph initialized — the `#graph` canvas exists, `vis` is defined inside the frame, node count > 0, and there are **no console/resource errors** (proves the vendored script loaded, not a blank frame). Confirm `/brain/vendor/vis-network.min.js` and `/brain/graph.html` both return 200.
- **Acceptance:** browser check shows a rendered graph with >0 nodes and zero errors; both assets 200.
- **Must not touch:** any source (verification only).
- **Test command:** manual browser drive via the in-app browser tools + `curl -sI localhost:PORT/brain/graph.html`.

## Global acceptance
- tsc / lint / production build green.
- Sync is validated + atomic; a broken/missing source never replaces a good snapshot (tested).
- The graph renders in the tab with the LOCAL vendored script and an `allow-scripts`-only sandbox (browser-verified, F1+F4).
- Nothing outside `app/(shell)/brain/`, `components/os/os-shell.tsx`, `scripts/sync-brain-graph.mjs`, `scripts/test-brain-sync.mjs`, `package.json`, and `public/brain/` is modified.
