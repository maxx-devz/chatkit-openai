import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BUILDER_CONFIG, validateBuilderConfig, publicBuilderConfig } from "../lib/builder-config.js";
import { fingerprint, liveConfig } from "../lib/builder-repository.js";

test("rejects injected tool configuration, invalid types, oversized text and invalid IDs", () => {
  for (const patch of [{ arbitraryTool: "shell" }, { images: "true" }, { imageLimit: 0 }, { imageLimit: 501 },
    { instructions: "x".repeat(12001) }, { instructions: "bad\u0000text" }, { vectorStoreId: "https://external" },
    { accent: "red" }, { starters: ["a", "b", "c", "d"] }]) {
    assert.throws(() => validateBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, ...patch }));
  }
});
test("client appearance never discloses instructions, knowledge, IDs or tool policy", () => {
  const config = validateBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, instructions: "private", knowledge: "approved private material", vectorStoreId: "vs_private" });
  assert.deepEqual(Object.keys(publicBuilderConfig(config)).sort(), ["accent", "greeting", "starters"]);
});
test("live admin edits remain authoritative and invalidate a draft publication baseline", () => {
  const row = { published: { ...DEFAULT_BUILDER_CONFIG, instructions: "old", vectorStoreId: "vs_old", documents: true } };
  const before = liveConfig({ assistant_instructions: "old", openai_vector_store_id: "vs_old" }, row);
  const after = liveConfig({ assistant_instructions: "new", openai_vector_store_id: "vs_new" }, row);
  assert.equal(after.instructions, "new");
  assert.equal(after.vectorStoreId, "vs_new");
  assert.equal(after.documents, true);
  assert.notEqual(fingerprint(before), fingerprint(after));
});
