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
