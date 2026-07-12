import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrgGraph, type Source, type Brand, type Agent } from "../lib/brain/org-graph.ts";

const okBrands: Source<Brand> = { state: "ok", data: [{ id: "gridfactory", name: "GridFactory.io" }, { id: "gulf", name: "Gulf-EL" }] };
const okAgents: Source<Agent> = { state: "ok", data: [{ id: "crina", name: "Crina" }, { id: "seo", name: "SEO Agent" }] };

function integrity(g) {
  const ids = new Set(g.nodes.map((n) => n.id));
  assert.equal(ids.size, g.nodes.length, "node ids unique");
  for (const l of g.links) {
    assert.ok(ids.has(l.source) && ids.has(l.target), `link endpoints exist: ${l.source}->${l.target}`);
  }
  const valid = new Set(["active", "planned", "success", "fallback", "error", "rate_limited", "idle"]);
  for (const n of g.nodes) {
    assert.ok(valid.has(n.status), `valid status: ${n.status}`);
    assert.ok(Number.isFinite(n.val) && n.val > 0, "positive val");
  }
}

test("live data: os + businesses + 8 domains + agents, all links valid", () => {
  const g = buildOrgGraph({ brands: okBrands, agents: okAgents, statusByAgentName: { Crina: "success" }, mailingActive: false });
  integrity(g);
  assert.equal(g.nodes.filter((n) => n.type === "os").length, 1);
  assert.equal(g.nodes.filter((n) => n.type === "business").length, 2);
  assert.equal(g.nodes.filter((n) => n.type === "domain").length, 8);
  assert.equal(g.nodes.filter((n) => n.type === "agent").length, 2);
  assert.equal(g.nodes.find((n) => n.label === "Crina")?.status, "success");
});

test("agent with no run → idle; unknown status → idle", () => {
  const g = buildOrgGraph({ brands: okBrands, agents: okAgents, statusByAgentName: { Crina: "bogus" }, mailingActive: false });
  assert.equal(g.nodes.find((n) => n.label === "Crina")?.status, "idle");
  assert.equal(g.nodes.find((n) => n.label === "SEO Agent")?.status, "idle");
});

test("empty tenant (ok + empty) shows NO fabricated businesses/agents", () => {
  const g = buildOrgGraph({ brands: { state: "ok", data: [] }, agents: { state: "ok", data: [] }, statusByAgentName: {}, mailingActive: false });
  assert.equal(g.nodes.filter((n) => n.type === "business").length, 0);
  assert.equal(g.nodes.filter((n) => n.type === "agent").length, 0);
  assert.equal(g.nodes.filter((n) => n.type === "domain").length, 8, "domains always present");
  integrity(g);
});

test("unavailable source → known skeleton (2 brands, 6 agents)", () => {
  const g = buildOrgGraph({ brands: { state: "unavailable" }, agents: { state: "unavailable" }, statusByAgentName: {}, mailingActive: false });
  assert.equal(g.nodes.filter((n) => n.type === "business").length, 2);
  assert.equal(g.nodes.filter((n) => n.type === "agent").length, 6);
  integrity(g);
});

test("mailing active flips status and href", () => {
  const off = buildOrgGraph({ brands: okBrands, agents: okAgents, statusByAgentName: {}, mailingActive: false });
  const on = buildOrgGraph({ brands: okBrands, agents: okAgents, statusByAgentName: {}, mailingActive: true });
  assert.equal(off.nodes.find((n) => n.id === "domain:mailing")?.status, "planned");
  assert.equal(off.nodes.find((n) => n.id === "domain:mailing")?.href, null);
  assert.equal(on.nodes.find((n) => n.id === "domain:mailing")?.status, "active");
});

test("planned domains have href null (no navigation)", () => {
  const g = buildOrgGraph({ brands: okBrands, agents: okAgents, statusByAgentName: {}, mailingActive: false });
  for (const id of ["domain:ads", "domain:trading", "domain:investor", "domain:assistant", "domain:web"]) {
    assert.equal(g.nodes.find((n) => n.id === id)?.href, null, `${id} not navigable`);
  }
  assert.equal(g.nodes.find((n) => n.id === "domain:marketing")?.href, "/marketing");
});

test("no secret-shaped values leak: output has only the allowed node keys", () => {
  const g = buildOrgGraph({
    brands: { state: "ok", data: [{ id: "x", name: "Brand", token: "ZZ_SECRET" } as unknown as Brand] },
    agents: okAgents, statusByAgentName: {}, mailingActive: false
  });
  const allowed = new Set(["id", "label", "type", "status", "href", "val", "group", "groupLabel"]);
  for (const n of g.nodes) for (const k of Object.keys(n)) assert.ok(allowed.has(k), `unexpected node key ${k}`);
  assert.ok(!JSON.stringify(g).includes("ZZ_SECRET"), "extra source fields never leak");
});
