// Learning library inbox + auto-detection. No network, no disk outside a temp dir.
import { test } from "node:test";
import assert from "node:assert/strict";
const { summarizeMarkdown, splitIdeas, parseLinks } = await import("../lib/learning/inbox.ts");
const { typeForFile, typeForUrl } = await import("../lib/learning/library.ts");

test("types are detected from the file or the link", () => {
  assert.equal(typeForFile({ type: "image/png", name: "a.png" }), "image");
  assert.equal(typeForFile({ type: "", name: "photo.JPG" }), "image");
  assert.equal(typeForFile({ type: "application/pdf", name: "deck.pdf" }), "document");
  assert.equal(typeForUrl("https://www.youtube.com/watch?v=abc"), "youtube");
  assert.equal(typeForUrl("https://youtu.be/abc"), "youtube");
  assert.equal(typeForUrl("https://open.spotify.com/episode/xyz"), "podcast");
  assert.equal(typeForUrl("https://example.com/post"), "link");
});

test("markdown: title from the first heading, short summary", () => {
  const s = summarizeMarkdown("# Gulf-EL / NexRide - Project Soul\n\nGulf-EL / NexRide is a founder-led mobility ecosystem.\n\n## Essence\n- point", "soul");
  assert.equal(s.title, "Gulf-EL / NexRide - Project Soul");
  assert.equal(s.summary, "Gulf-EL / NexRide is a founder-led mobility ecosystem.");
  assert.equal(summarizeMarkdown("no heading here", "fallback").title, "fallback");
});

test("ideas.md splits by ## heading; links.txt one per line", () => {
  assert.deepEqual(splitIdeas("intro\n## First idea\nDo X.\n## Second\nDo Y.\n## Empty\n"), [{ title: "First idea", notes: "Do X." }, { title: "Second", notes: "Do Y." }]);
  assert.deepEqual(parseLinks("# my links\nFounder talk | https://youtu.be/abc\nhttps://example.com/a\n\nnot a link"), [
    { title: "Founder talk", url: "https://youtu.be/abc" },
    { title: "example.com/a", url: "https://example.com/a" }
  ]);
});

test("library ranking: keyword matches first, brand + text items next, at most 10, excerpts ≤ 1,500 chars", async () => {
  const { rankLibraryItems, libraryText, keywords, LIBRARY_MAX_ITEMS, LIBRARY_EXCERPT_CHARS } = await import("../lib/learning/library.ts");
  const now = Date.parse("2026-11-20T12:00:00Z");
  const mk = (id: string, title: string, extra: Partial<{ item_type: string; brand_id: string | null; created_at: string; tags: string[] }> = {}) => ({
    id, title, item_type: "image", tags: [], brand_id: "b1", created_at: "2026-11-20T10:00:00Z", ...extra
  }) as Parameters<typeof rankLibraryItems>[0][number];
  const many = Array.from({ length: 700 }, (_, n) => mk(`img${n}`, `nexride experience frame ${n}`));
  const items = [
    ...many,
    mk("bkk", "Bangkok night city frames", { tags: ["bangkok", "night"] }),
    mk("doc", "Gulf-EL / NexRide - Offer", { item_type: "document", tags: ["offer"] }),
    mk("other", "Bangkok skyline", { brand_id: null, created_at: "2025-01-01T00:00:00Z" })
  ];
  assert.deepEqual(keywords("The Bangkok night launch, 2026!"), ["bangkok", "night", "launch"]);
  const picked = rankLibraryItems(items, "Bangkok night launch for drivers", "b1", LIBRARY_MAX_ITEMS, now);
  assert.equal(picked.length, LIBRARY_MAX_ITEMS);
  assert.equal(picked[0].id, "bkk");
  assert.equal(picked[1].id, "other");
  assert.equal(picked[2].id, "doc");
  const text = libraryText(Array.from({ length: 30 }, (_, n) => ({ item_type: "document" as const, title: `T${n}`, tags: [], url: null, notes: "x".repeat(5000) })));
  assert.equal(text.split("\n").length, 1 + LIBRARY_MAX_ITEMS);
  assert.ok(text.split("\n")[1].length < LIBRARY_EXCERPT_CHARS + 40);
});
