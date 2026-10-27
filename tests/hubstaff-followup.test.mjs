import test from "node:test";
import assert from "node:assert/strict";
import { hubstaffContextQuery, hubstaffCredentialAuditRequested, hubstaffTaskReferences,
  hubstaffTaskConversationRequested, hubstaffTaskAttachmentsRequested, hubstaffMetricsRequested,
  hubstaffTaskDateRange } from "../lib/chatkit-hubstaff.js";
import { safeTaskConversation, safeTaskAttachments } from "../lib/hubstaff-task-content.js";
import { redactSensitiveText } from "../lib/sensitive-text.js";
import { consumeAdminResponse } from "../lib/admin-response-stream.js";

const link = "https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/5426464";
const message = text => ({ type: "threads.add_user_message", params: { input: { content: [{ type: "input_text", text }] } } });

test("Comment follow-up never inherits a credential scan or unrelated assistant task links", () => {
  const prior = `User: Show comments on ${link}\nAssistant: These comments include credentials and API keys; omitted. Budget hours 2023.\nAssistant: Other task https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/99`;
  const query = hubstaffContextQuery(message("show me the comments on that task"), prior);
  assert.equal(hubstaffCredentialAuditRequested(query), false);
  assert.equal(hubstaffTaskConversationRequested(query), true);
  assert.equal(hubstaffMetricsRequested(query), false);
  assert.equal(hubstaffTaskDateRange(query), null);
  assert.deepEqual(hubstaffTaskReferences(query).map(ref => ref.url), [link]);
  assert.equal(hubstaffCredentialAuditRequested("List tasks where credentials were shared"), true);
  assert.equal(hubstaffCredentialAuditRequested("Scan this task for credentials " + link), false);
  assert.equal(hubstaffCredentialAuditRequested("Show the comments containing API keys on that task"), false);
});

test("Explicit new task overrides prior links; retries use the last user request, not assistant words", () => {
  const next = link.replace("5426464", "88");
  const query = hubstaffContextQuery(message("show comments on this task " + next), `User: read ${link}\nAssistant: security scan credentials`);
  assert.deepEqual(hubstaffTaskReferences(query).map(ref => ref.url), [next]);
  const retry = hubstaffContextQuery({ type: "threads.retry_after_item" }, `User: show comments on ${link}\nAssistant: credentials omitted`);
  assert.equal(hubstaffCredentialAuditRequested(retry), false);
  assert.equal(hubstaffTaskConversationRequested(retry), true);
  assert.equal(hubstaffTaskAttachmentsRequested(hubstaffContextQuery(message("read the attachment"), `User: read ${link}`)), true);
  assert.deepEqual(hubstaffTaskReferences(hubstaffContextQuery(message("read the attachment"), `User: read ${link}`)).map(ref => ref.url), [link]);
});

test("Comments retain useful prose, remove credentials, preserve dates and report bounds", () => {
  const result = safeTaskConversation({ truncated: false, items: [
    { id: 2, created_at: "2026-10-02", content: "API token: very-private-secret\nThe migration is ready for client review." },
    { id: 1, created_at: "2026-10-01", content: "WebDAV access confirmed.\nPassword&#58; Hidden123!\nHomepage draft approved." },
  ] });
  assert.equal(result.comments[0].createdAt, "2026-10-01");
  assert.equal(result.redactedComments, 2);
  assert.equal(result.sensitiveCommentsOmitted, 0);
  assert.match(result.comments[0].content, /Homepage draft approved/);
  assert.doesNotMatch(JSON.stringify(result), /very-private-secret|Hidden123/);
  assert.equal(safeTaskConversation({ items: Array.from({ length: 42 }, (_, id) => ({id, created_at: String(id).padStart(3, "0"), content: "Okay"})) }).truncated, true);
});

test("Attachment metadata is restricted to this task and never claims content was read", () => {
  const result = safeTaskAttachments({ items: [{ id: 1, task_id: 5, file_name: "brief.pdf" },
    { id: 2, task_id: 6, file_name: "other-client.pdf" }], truncated: false }, 5);
  assert.equal(result.items.length, 1);
  assert.equal(result.contentAvailable, false);
  assert.match(result.reason, /Upload the file/);
  assert.doesNotMatch(JSON.stringify(result), /other-client/);
});

test("Redactor handles common credentials, headers, multiline fields and safe task links", () => {
  const secrets = ["PlainPass123!", "sk-proj-abcdefghijklmnop123456", "hsoat_abcdefghijklmnop123456", "eyJabcdefghijk.abcdefghijkl.signature", "known-custom-secret"];
  const text = `Approved work.\nPassword is ${secrets[0]}\nAPI token: ${secrets[1]}\n${secrets[2]}\n${secrets[3]}\n${secrets[4]}\nAuthorization: Bearer abcdefghijkl\nclient_secret=\nPrivateValue123\nhttps://example.com/?api_key=hidden\nLink: ${link}\nAPI integration is complete.`;
  const safe = redactSensitiveText(text, [secrets[4]]);
  for (const value of [...secrets, "PrivateValue123", "api_key=hidden", "abcdefghijkl"]) assert.equal(safe.includes(value), false, value);
  assert.ok(safe.includes(link));
  assert.match(safe, /API integration is complete/);
});

test("Admin response checks complete text across token chunks and discards failed partial output", async () => {
  async function* events(fail = false) {
    yield { type: "response.output_text.delta", delta: "Password: Plain" };
    yield { type: "response.output_text.delta", delta: "Pass123!\nReady for review." };
    yield fail ? { type: "response.failed", response: {error: {code:"test"}} } : {type:"response.completed"};
  }
  const output = [];
  await consumeAdminResponse(events(), { onDelta: delta => output.push(delta), onUsage: () => {} });
  assert.doesNotMatch(output.join(""), /PlainPass/);
  assert.match(output.join(""), /Ready for review/);
  const partial = [];
  await assert.rejects(consumeAdminResponse(events(true), {onDelta: delta => partial.push(delta), onUsage: () => {}}));
  assert.deepEqual(partial, []);
});
