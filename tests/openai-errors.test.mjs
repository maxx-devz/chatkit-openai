import test from "node:test";
import assert from "node:assert/strict";
import { openaiIssue, providerStatus } from "../lib/openai-issues.js";
import { consumeAdminResponse } from "../lib/admin-response-stream.js";

test("billing exhaustion and rate limiting have different explanations and actions", () => {
  assert.equal(openaiIssue({ status: 429, code: "credit_balance_exhausted" }).billing, true);
  assert.equal(openaiIssue({ status: 429, error: { code: "insufficient_quota" } }).billing, true);
  assert.equal(openaiIssue({ status: 429 }).billing, false);
  assert.equal(openaiIssue({ status: 429 }).code, "rate_limit_exceeded");
  assert.equal(openaiIssue({ code: "billing_hard_limit_reached" }).code, "insufficient_quota");
  assert.ok(!JSON.stringify(openaiIssue({ code: "unknown", message: "sk-secret private prompt" })).includes("sk-secret"));
  assert.equal(providerStatus(null).code, "unknown");
  assert.equal(providerStatus("ready").code, "ready");
});

async function stream(events) {
  const output = { text: "", usage: null };
  await consumeAdminResponse(events, { onDelta: value => { output.text += value; }, onUsage: value => { output.usage = value; } });
  return output;
}

test("HTTP 200 streams still surface quota failures, truncation and output limits", async () => {
  await assert.rejects(stream([{ type: "error", code: "credit_balance_exhausted" }]), { code: "credit_balance_exhausted" });
  await assert.rejects(stream([{ type: "response.failed", response: { error: { code: "insufficient_quota" } } }]), { code: "insufficient_quota" });
  await assert.rejects(stream([{ type: "response.output_text.delta", delta: "Partial" }]), { code: "response_incomplete" });
  await assert.rejects(stream([{ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }]), { code: "output_limit" });
  await assert.rejects(stream([{ type: "response.completed", response: {} }]), { code: "response_incomplete" });
});

test("only completed replies with text count as success and retain reported usage", async () => {
  const usage = { input_tokens: 8, output_tokens: 2, total_tokens: 10 };
  assert.deepEqual(await stream([{ type: "response.output_text.delta", delta: "Hello" },
    { type: "response.completed", response: { usage } }]), { text: "Hello", usage });
});
