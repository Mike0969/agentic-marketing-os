// Tests for sync-brain-graph.mjs: validation, no-write-on-failure, CDN rewrite, atomicity.
// Never touches the committed public/brain snapshot — points the script at a temp REPO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const SCRIPT = path.join(process.cwd(), "scripts", "sync-brain-graph.mjs");
const REAL_VENDOR = path.join(process.cwd(), "public", "brain", "vendor", "vis-network.min.js");

// A temp repo: public/brain/vendor with a stand-in vendor file, and a separate brain source dir.
function scaffold() {
  const repo = mkdtempSync(path.join(os.tmpdir(), "brain-repo-"));
  mkdirSync(path.join(repo, "public", "brain", "vendor"), { recursive: true });
  writeFileSync(path.join(repo, "public", "brain", "vendor", "vis-network.min.js"), "/* stand-in vendor */");
  const brain = mkdtempSync(path.join(os.tmpdir(), "brain-src-"));
  mkdirSync(path.join(brain, "graphify-out"), { recursive: true });
  return { repo, brain };
}
function goodGraph() {
  // >=50000 bytes, has the required markers + an unpkg script tag to rewrite
  return `<!DOCTYPE html><html><head>\n<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js" integrity="sha384-x" crossorigin="anonymous"></script>\n</head><body><div id="graph"></div><script>new vis.Network(document.getElementById('graph'),{},{});</script>\n${"<!-- pad -->".repeat(6000)}</body></html>`;
}
function run(repo, brain) {
  return execFileSync("node", [SCRIPT], { cwd: repo, env: { ...process.env, BUSINESS_BRAIN_DIR: brain }, encoding: "utf8" });
}
function snapshot(repo) {
  const g = path.join(repo, "public", "brain", "graph.html");
  return existsSync(g) ? readFileSync(g, "utf8") : null;
}

test("happy path: rewrites CDN to local vendor, writes graph + meta", () => {
  const { repo, brain } = scaffold();
  writeFileSync(path.join(brain, "graphify-out", "graph.html"), goodGraph());
  run(repo, brain);
  const out = snapshot(repo);
  assert.ok(out.includes("/brain/vendor/vis-network.min.js"), "local vendor ref present");
  assert.ok(!out.includes("unpkg.com"), "unpkg removed");
  assert.ok(out.includes("<!-- brain-graph synced"), "provenance embedded in graph.html (single-unit publish)");
  assert.ok(!existsSync(path.join(repo, "public", "brain", "meta.json")), "no separate meta.json");
  rmSync(repo, { recursive: true, force: true }); rmSync(brain, { recursive: true, force: true });
});

test("missing source: exit 1, existing snapshot untouched", () => {
  const { repo, brain } = scaffold();
  writeFileSync(path.join(brain, "graphify-out", "graph.html"), goodGraph());
  run(repo, brain);                         // establish a good snapshot
  const before = snapshot(repo);
  rmSync(path.join(brain, "graphify-out", "graph.html"));  // now source is gone
  assert.throws(() => run(repo, brain), /status 1|Command failed/);
  assert.equal(snapshot(repo), before, "snapshot byte-identical after failed run");
  rmSync(repo, { recursive: true, force: true }); rmSync(brain, { recursive: true, force: true });
});

test("malformed (too small) source: exit 1, no write", () => {
  const { repo, brain } = scaffold();
  writeFileSync(path.join(brain, "graphify-out", "graph.html"), "<html>tiny</html>");
  assert.throws(() => run(repo, brain), /status 1|Command failed/);
  assert.equal(snapshot(repo), null, "nothing written for malformed source");
  rmSync(repo, { recursive: true, force: true }); rmSync(brain, { recursive: true, force: true });
});

test("missing vendor: exit 1 with instruction", () => {
  const { repo, brain } = scaffold();
  rmSync(path.join(repo, "public", "brain", "vendor"), { recursive: true, force: true });
  writeFileSync(path.join(brain, "graphify-out", "graph.html"), goodGraph());
  assert.throws(() => run(repo, brain), /status 1|Command failed/);
  rmSync(repo, { recursive: true, force: true }); rmSync(brain, { recursive: true, force: true });
});

test("no leftover temp files after a successful run", () => {
  const { repo, brain } = scaffold();
  writeFileSync(path.join(brain, "graphify-out", "graph.html"), goodGraph());
  run(repo, brain);
  const leftovers = execFileSync("bash", ["-c", `ls -a "${path.join(repo, "public", "brain")}" | grep -c '\\.tmp' || true`], { encoding: "utf8" }).trim();
  assert.equal(leftovers, "0", "no .tmp files remain");
  rmSync(repo, { recursive: true, force: true }); rmSync(brain, { recursive: true, force: true });
});

// sanity: the real vendored file exists and is the full bundle (not the stand-in)
test("real vendored vis-network is present and substantial", () => {
  assert.ok(existsSync(REAL_VENDOR), "vendor file committed");
  assert.ok(statSync(REAL_VENDOR).size > 400000, "vendor is the full UMD bundle");
});
