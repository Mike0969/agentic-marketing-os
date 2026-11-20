// Agents board cards: a plain sentence, never raw JSON.
import { test } from "node:test";
import assert from "node:assert/strict";
const { summarizeRunOutput } = await import("../lib/agents/run-summary.ts");
test("known automation shapes become sentences", () => {
  assert.equal(summarizeRunOutput({ awaiting: 9, newLeads: 0, published: 0 }), "9 items waiting for review, 0 new leads, 0 published.");
  assert.equal(summarizeRunOutput({ rules: 0, brands_consolidated: 2 }), "Memory consolidated for 2 brands, 0 new rules.");
  assert.equal(summarizeRunOutput({ weakness: "", proposal: "" }), "Reflection ran; no new weakness found.");
  assert.equal(summarizeRunOutput({ CTA: "Request the brief.", body: "Power readiness is the foundation." }), "Draft: Power readiness is the foundation. · CTA: Request the brief.");
});
test("own summary first; errors; generic fallback has no braces", () => {
  assert.equal(summarizeRunOutput({ summary: "Did it.", awaiting: 3 }), "Did it.");
  assert.equal(summarizeRunOutput({ x: 1 }, "Boom"), "Boom");
  const generic = summarizeRunOutput({ outcomes: 2, insightCount: 1, nested: { a: 1 } })!;
  assert.equal(generic, "outcomes: 2, insight count: 1.");
  assert.ok(!generic.includes("{"));
});
