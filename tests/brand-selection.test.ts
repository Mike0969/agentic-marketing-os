import { test } from "node:test";
import assert from "node:assert/strict";
import { orderBySelection, pickSelectedBrandId } from "../lib/marketing/brand-selection.ts";

const grid = { id: "g", name: "GridFactory.io", is_default: false };
const gulf = { id: "u", name: "Gulf-EL.com / NexRide", is_default: false };

test("brand selection: header cookie > Settings default > Gulf-EL > first; the selected brand goes first", () => {
  assert.equal(pickSelectedBrandId([grid, gulf]), "u"); // never "first alphabetically" (Grid)
  assert.equal(pickSelectedBrandId([grid, { ...gulf }].map((b) => (b.id === "g" ? { ...b, is_default: true } : b))), "g");
  assert.equal(pickSelectedBrandId([grid, gulf], "g"), "g");
  assert.equal(pickSelectedBrandId([grid, gulf], "deleted-brand"), "u");
  assert.equal(pickSelectedBrandId([]), null);
  assert.deepEqual(orderBySelection([grid, gulf], "u").map((b) => b.id), ["u", "g"]);
  assert.deepEqual(orderBySelection([grid, gulf], null).map((b) => b.id), ["g", "u"]);
});
