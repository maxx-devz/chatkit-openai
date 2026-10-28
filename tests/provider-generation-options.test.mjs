import test from "node:test";
import assert from "node:assert/strict";
import { modelReasoningEfforts, validateGenerationOptions, runtimeGenerationOptions } from "../lib/provider-generation-options.js";
import { modelBlocked } from "../lib/model-availability.js";

test("Luna effort uses the exact API field; Auto and changed models omit optional parameters", () => {
  const model = { id: "gpt-6-luna" };
  for (const reasoningEffort of ["low", "medium", "high"]) {
    const generationOptions = validateGenerationOptions("openai", model, { reasoningEffort });
    assert.deepEqual(runtimeGenerationOptions({ id: "openai", model: model.id, generationOptions }), { reasoning: { effort: reasoningEffort } });
    assert.deepEqual(runtimeGenerationOptions({ id: "openai", model: "gpt-other", generationOptions }), {});
  }
  assert.deepEqual(runtimeGenerationOptions({ id: "openai", model: model.id,
    generationOptions: validateGenerationOptions("openai", model) }), {});
  assert.deepEqual(modelReasoningEfforts("openai", { id: "gpt-unknown" }), ["auto"]);
});

test("OpenRouter choices follow model metadata, dynamic routers keep provider defaults", () => {
  const model = { id: "vendor/model:free", reasoning: { supported_efforts: ["medium", "high"] } };
  assert.deepEqual(modelReasoningEfforts("openrouter", model), ["auto", "medium", "high"]);
  assert.throws(() => validateGenerationOptions("openrouter", model, { reasoningEffort: "low" }));
  assert.deepEqual(runtimeGenerationOptions({ id: "openrouter", model: model.id,
    generationOptions: validateGenerationOptions("openrouter", model, { reasoningEffort: "medium" }) }), { reasoning: { effort: "medium" } });
  assert.deepEqual(modelReasoningEfforts("openrouter", { id: "openrouter/free" }), ["auto"]);
});

test("temporary throttling never locks a listed model; real incompatibility remains blocked", () => {
  assert.equal(modelBlocked({ availability: { status: "temporary" } }), false);
  assert.equal(modelBlocked({ supportsTools: false }), true);
  assert.equal(modelBlocked({ availability: { status: "blocked" } }), true);
});
