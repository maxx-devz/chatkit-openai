import test from "node:test";
import assert from "node:assert/strict";
import { selectedProviderModel, providerSetupMessage, missingProviderSchemaMessage } from "../lib/provider-configuration.js";

const draft = () => ({ catalogProvider: "openai", verified: true, model: "gpt-6-luna",
  models: [{ id: "gpt-6-luna", label: "GPT 6 luna", supportsTools: true }] });

test("provider save sends the catalog API ID, never the human-readable label", () => {
  const value = draft();
  const body = JSON.parse(JSON.stringify({ provider: "openai", model: selectedProviderModel("openai", value) }));
  assert.equal(body.model, "gpt-6-luna");
  assert.notEqual(body.model, value.models[0].label);
});

test("display labels and unknown values cannot be submitted as model IDs", () => {
  for (const model of ["GPT 6 luna", "GPT 6 luna — gpt-6-luna", "gpt-missing", "", null]) {
    assert.throws(() => selectedProviderModel("openai", { ...draft(), model }));
  }
});

test("unverified, wrong-provider and tool-incompatible catalogs are rejected", () => {
  assert.throws(() => selectedProviderModel("openai", { ...draft(), verified: false }));
  assert.throws(() => selectedProviderModel("openrouter", draft()));
  assert.throws(() => selectedProviderModel("openai", { ...draft(), models: [{ id: "gpt-6-luna", supportsTools: false }] }));
});

test("OpenRouter IDs including vendor and free suffix are preserved exactly", () => {
  const model = "vendor/model:free";
  assert.equal(selectedProviderModel("openrouter", { catalogProvider: "openrouter", verified: true,
    model, models: [{ id: model, label: "Vendor Model (Free)", supportsTools: true }] }), model);
});

test("setup diagnostics distinguish provider schema, audit schema and encryption", () => {
  const ready = { tablesReady: true, auditReady: true, encryptionReady: true };
  assert.equal(providerSetupMessage(ready), "");
  assert.match(providerSetupMessage({ ...ready, tablesReady: false }), /site-ai:migrate/);
  assert.match(providerSetupMessage({ ...ready, auditReady: false }), /admin-audit:migrate/);
  assert.match(providerSetupMessage({ ...ready, encryptionReady: false }), /PROVIDER_SETTINGS_SECRET/);
});

test("a missing audit relation does not misleadingly request the provider migration", () => {
  const audit = { code: "42P01", message: 'relation "portal_audit_events" does not exist' };
  assert.match(missingProviderSchemaMessage(audit), /admin-audit:migrate/);
  assert.doesNotMatch(missingProviderSchemaMessage(audit), /site-ai:migrate/);
  assert.match(missingProviderSchemaMessage({ code: "42P01", message: 'relation "portal_ai_credentials" does not exist' }), /site-ai:migrate/);
  assert.equal(missingProviderSchemaMessage(new Error("private connection details")), null);
});
