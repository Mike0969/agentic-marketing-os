// Copy the business-brain knowledge graph into this app's public/ as a committed,
// self-contained snapshot for the /brain tab. Validated + atomic; rewrites graphify's
// CDN vis-network <script> to the locally vendored, SRI-verified bundle so the graph
// works offline, under any CSP, and inside an allow-scripts-only iframe sandbox.
//
//   npm run brain:graph
//
// Writes ONLY inside public/brain/ (never the vendor file, never the source). A missing,
// too-small, or malformed source aborts WITHOUT touching the existing snapshot.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
// meta.json removed — provenance is embedded in graph.html for single-unit atomic publish.

const REPO = process.cwd();
const BRAIN_DIR = process.env.BUSINESS_BRAIN_DIR ?? path.join(REPO, "..", "business-brain");
const SRC = path.join(BRAIN_DIR, "graphify-out", "graph.html");
const OUT_DIR = path.join(REPO, "public", "brain");
const VENDOR = path.join(OUT_DIR, "vendor", "vis-network.min.js");
const LOCAL_SRC = "/brain/vendor/vis-network.min.js";

function die(msg) { console.error(`sync-brain-graph: ${msg}`); process.exit(1); }

// --- write-boundary safety: refuse symlinked destination components ---
for (const p of [OUT_DIR, path.join(OUT_DIR, "graph.html")]) {
  if (existsSync(p) && lstatSync(p).isSymbolicLink()) die(`destination is a symlink: ${p}`);
}

// --- vendor guard (the sync never downloads) ---
if (!existsSync(VENDOR)) {
  die(`vendored vis-network missing at ${VENDOR}. Vendor it once (download vis-network@9.1.6 UMD, verify its sha384, place it there).`);
}

// --- validate source before any write ---
if (!existsSync(SRC) || !lstatSync(SRC).isFile()) {
  die(`source graph not found: ${SRC} (run 'graphify update .' in business-brain first). Existing snapshot left untouched.`);
}
let html = readFileSync(SRC, "utf8");
if (Buffer.byteLength(html) < 50000 || !html.includes("vis.Network") || !html.includes('id="graph"')) {
  die(`source graph looks malformed/truncated (size or markers). Existing snapshot left untouched.`);
}

// --- rewrite the unpkg vis-network <script> to the local vendored bundle ---
html = html.replace(/<script\s+src="https:\/\/unpkg\.com\/vis-network[^>]*>\s*<\/script>/i, `<script src="${LOCAL_SRC}"></script>`);
if (html.includes("unpkg.com") || !html.includes(LOCAL_SRC)) {
  die(`could not rewrite the vis-network <script> tag to the local vendor path; aborting without writing.`);
}

// --- single-unit atomic publication (F5): embed provenance INTO graph.html so the
// snapshot is self-describing; publish with ONE rename. No separate meta file can skew. ---
const stamp = `<!-- brain-graph synced ${new Date().toISOString()} from ${SRC} -->`;
if (html.includes("</head>")) html = html.replace("</head>", `${stamp}\n</head>`);
else html = `${stamp}\n${html}`;

mkdirSync(OUT_DIR, { recursive: true });
const tmpHtml = path.join(OUT_DIR, `.graph.${process.pid}.tmp`);
writeFileSync(tmpHtml, html);
renameSync(tmpHtml, path.join(OUT_DIR, "graph.html")); // atomic; graph is always internally consistent

const sha = createHash("sha256").update(html).digest("hex").slice(0, 12);
console.log(`synced ${Buffer.byteLength(html)} bytes (sha256:${sha}) -> public/brain/graph.html`);
