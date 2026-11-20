// Brand placeholder detection and the plain-words safety-block reason shown on the Agents board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandFieldState, brandGaps, safetyBlockReason } from "../lib/marketing/brand-placeholders.ts";

const testBrand = {
  name: "NexRide",
  website: "https://example.com",
  positioning: "TEST BRAND - placeholder positioning (wording pending Mihai).",
  target_audience: "TEST BRAND - placeholder audience.",
  tone_of_voice: "TEST BRAND - placeholder tone.",
  pillars: "",
  content_pillars: null,
  ctas: null,
  reusable_ctas: "Book a ride"
};

test("placeholder vs empty vs filled fields", () => {
  const gaps = brandGaps(testBrand);
  assert.deepEqual(gaps.placeholder, ["Website", "Positioning", "Target audience", "Tone of voice"]);
  assert.ok(gaps.empty.includes("Pillars"));
  assert.ok(!gaps.empty.includes("CTAs"), "reusable_ctas counts for CTAs");
  assert.equal(brandFieldState({ positioning: "Zero-commission EV rides for Dubai drivers." }, ["positioning"]), "ok");
  assert.deepEqual(brandGaps(null), { placeholder: [], empty: [] });
});

test("reason names the brand and the score when brand details are placeholder", () => {
  assert.equal(
    safetyBlockReason("content", 26, testBrand),
    "Blocked by safety check: brand details are still placeholder (score 26/100). Fill in Brands → NexRide."
  );
});

test("a visual block says the image concept failed, then points at the placeholder brand", () => {
  assert.equal(
    safetyBlockReason("visual", 57, testBrand),
    "Blocked by safety check: the image concept failed the visual safety review (score 57/100). No image was made. Brand details are still placeholder too: fill in Brands → NexRide."
  );
});

test("reason without placeholder fields does not blame the brand", () => {
  const real = { ...testBrand, website: "https://nexride.ae", positioning: "EV rides", target_audience: "Dubai commuters", tone_of_voice: "Plain, warm" };
  assert.match(safetyBlockReason("content", 30, real), /^Blocked by safety check: the draft made claims the reviewer could not verify \(score 30\/100\)/);
  assert.match(safetyBlockReason("visual", 10, real), /visual safety review \(score 10\/100\)/);
});
