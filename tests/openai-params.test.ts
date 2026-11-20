// Current OpenAI models reject max_tokens and non-default temperature.
import { test } from "node:test";
import assert from "node:assert/strict";
const { fixedTemperature } = await import("../lib/providers/openai.ts");
test("models that only accept the default temperature", () => {
  for (const m of ["gpt-5-mini", "gpt-5.6-terra", "gpt-6-astra", "o3", "chatgpt-image-latest"]) assert.equal(fixedTemperature(m), true, m);
  for (const m of ["gpt-4o-mini", "gpt-4.1", "deepseek-flash"]) assert.equal(fixedTemperature(m), false, m);
});

test("JSON mode always has the word json in the system prompt", async () => {
  const { withJsonHint } = await import("../lib/providers/utils.ts");
  assert.match(withJsonHint(undefined), /JSON/);
  assert.match(withJsonHint("Write a post."), /^Write a post\.\nRespond with a single valid JSON object\.$/);
  assert.equal(withJsonHint("Return JSON only."), "Return JSON only.");
});
