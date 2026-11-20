import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OFFER_CATALOGUE, OFFER_TYPES, SIGNAL_TYPES, WORDING_PENDING_MARKER, offerForSignal } from "../lib/marketing/nexride/offer-catalogue.ts";

test("every signal type maps to exactly one offer type", () => {
  for (const s of SIGNAL_TYPES) {
    const matches = OFFER_TYPES.filter((t) => OFFER_CATALOGUE[t].triggeredBy === s);
    assert.equal(matches.length, 1, s);
    assert.equal(offerForSignal(s).triggeredBy, s);
  }
});

test("catalogue carries types only: no amount/price fields", () => {
  const json = JSON.stringify(OFFER_CATALOGUE);
  assert.ok(!/amount|price|aed|eur|ron|percent/i.test(json), json);
});

test("rider and driver voice files exist and are marked pending approval, with no amounts", () => {
  const files = new Set(OFFER_TYPES.flatMap((t) => OFFER_CATALOGUE[t].voiceFiles));
  assert.equal(files.size, 2);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.ok(text.includes(WORDING_PENDING_MARKER), f);
    assert.ok(!/\d+\s*(AED|EUR|RON|lei|%)/i.test(text), `${f} must not contain amounts`);
  }
});

test("offer catalogue doc has no amounts", () => {
  const text = readFileSync("hermes-brain/projects/gulf-el-nexride/offer-catalogue.md", "utf8");
  assert.ok(!/\d+\s*(AED|EUR|RON|lei|%)/i.test(text));
});
