import test from "node:test";
import assert from "node:assert/strict";
import { readSiteModel, validateSiteModel, writeSiteModel } from "../lib/site-ai-repository.js";

const provider = { id: "openrouter", model: "openrouter/free" };

test("saved model overrides environment and is re-read for every reply", async () => {
  let selected = "vendor/one:free";
  const sql = async (_strings, id) => {
    assert.equal(id, "openrouter");
    return [{ model: selected, updated_at: "today" }];
  };
  assert.equal((await readSiteModel(sql, provider)).model, selected);
  selected = "vendor/two:free";
  assert.equal((await readSiteModel(sql, provider)).model, selected);
});

test("environment is a fallback only when there is no setting or migration", async () => {
  assert.deepEqual(await readSiteModel(async () => [], provider), {
    model: provider.model, source: "environment", ready: true, updatedAt: null,
  });
  const missing = async () => { throw Object.assign(new Error(), { code: "42P01" }); };
  assert.equal((await readSiteModel(missing, provider)).ready, false);
  await assert.rejects(readSiteModel(async () => { throw new Error("offline"); }, provider), /offline/);
});

test("global selection rejects unverified, missing, or tool-incompatible models", () => {
  const catalog = { verified: true, models: [
    { id: "vendor/tool:free", supportsTools: true },
    { id: "vendor/text:free", supportsTools: false },
  ] };
  assert.equal(validateSiteModel("vendor/tool:free", catalog), "vendor/tool:free");
  for (const model of [null, "", "vendor/missing", "vendor/text:free", "x".repeat(201)]) {
    assert.throws(() => validateSiteModel(model, catalog));
  }
  assert.throws(() => validateSiteModel("vendor/tool:free", { ...catalog, verified: false }));
});

test("write uses parameterized values and records the authenticated admin", async () => {
  const sql = async (strings, ...values) => {
    assert.match(strings.join("?"), /ON CONFLICT \(provider\) DO UPDATE/);
    assert.deepEqual(values, ["openrouter", "vendor/tool:free", "7"]);
    return [{ model: values[1], updated_at: "now" }];
  };
  assert.deepEqual(await writeSiteModel(sql, provider, "vendor/tool:free", "7"), {
    model: "vendor/tool:free", source: "admin", updatedAt: "now", ready: true,
  });
});
