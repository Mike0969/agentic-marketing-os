import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAssetCandidates, type AssetLike, type UsageLike } from "../lib/marketing/asset-reuse-policy.ts";

const asset = (id: string, over: Partial<AssetLike> = {}): AssetLike => ({
  id,
  mandatory: false,
  quality_score: 0,
  used_count: 0,
  reuse_allowed: true,
  ...over
});

test("never returns an asset already used on the SAME platform", () => {
  const assets = [asset("a"), asset("b")];
  const usages: UsageLike[] = [{ asset_id: "a", platform: "linkedin" }];
  const out = selectAssetCandidates(assets, usages, "linkedin").map((a) => a.id);
  assert.deepEqual(out, ["b"]);
});

test("an asset used on one platform is still allowed on a DIFFERENT platform", () => {
  const assets = [asset("a")];
  const usages: UsageLike[] = [{ asset_id: "a", platform: "linkedin" }];
  const out = selectAssetCandidates(assets, usages, "x").map((a) => a.id);
  assert.deepEqual(out, ["a"]);
});

test("single-use asset (reuse_allowed=false) is excluded everywhere after first use", () => {
  const assets = [asset("a", { reuse_allowed: false })];
  const usedElsewhere: UsageLike[] = [{ asset_id: "a", platform: "instagram" }];
  assert.equal(selectAssetCandidates(assets, usedElsewhere, "x").length, 0);
  // ...but before any use it is available
  assert.equal(selectAssetCandidates(assets, [], "x").length, 1);
});

test("platform match is case-insensitive", () => {
  const assets = [asset("a")];
  const usages: UsageLike[] = [{ asset_id: "a", platform: "LinkedIn" }];
  assert.equal(selectAssetCandidates(assets, usages, "linkedin").length, 0);
});

test("ranking: mandatory first, then higher quality, then least used", () => {
  const assets = [
    asset("low", { quality_score: 10, used_count: 0 }),
    asset("high", { quality_score: 90, used_count: 5 }),
    asset("must", { mandatory: true, quality_score: 1 })
  ];
  const out = selectAssetCandidates(assets, [], "x").map((a) => a.id);
  assert.deepEqual(out, ["must", "high", "low"]);
});

test("least-used breaks ties at equal quality (library rotates)", () => {
  const assets = [
    asset("used", { quality_score: 50, used_count: 3 }),
    asset("fresh", { quality_score: 50, used_count: 0 })
  ];
  const out = selectAssetCandidates(assets, [], "x").map((a) => a.id);
  assert.deepEqual(out, ["fresh", "used"]);
});

test("respects the limit", () => {
  const assets = [asset("a"), asset("b"), asset("c"), asset("d")];
  assert.equal(selectAssetCandidates(assets, [], "x", 2).length, 2);
});

test("empty library returns nothing", () => {
  assert.equal(selectAssetCandidates([], [], "x").length, 0);
});
