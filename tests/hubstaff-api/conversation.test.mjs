import test from "node:test";
import assert from "node:assert/strict";
import { loadHubstaffAssistantSnapshot } from "../../lib/hubstaff.js";
import { hubstaffContextQuery } from "../../lib/chatkit-hubstaff.js";

const project = "https://tasks.hubstaff.com/app/organizations/1/projects/7";
const link = project + "/tasks/5";

test("Real snapshot route reads the one task's comments and attachments, not a credential scan", async t => {
  const originalFetch = globalThis.fetch;
  const originalPat = process.env.HUBSTAFF_PAT_REFRESH_TOKEN;
  const originalToken = process.env.HUBSTAFF_ACCESS_TOKEN;
  process.env.HUBSTAFF_PAT_REFRESH_TOKEN = "";
  process.env.HUBSTAFF_ACCESS_TOKEN = "test-only";
  const paths = [];
  let denied = false;
  globalThis.fetch = async value => {
    const url = new URL(value);
    paths.push(url.pathname);
    const payload = url.pathname === "/api/v1/tasks/5" ? { task: { id: 5, list_id: 9, subject: "Migration", description: "Homepage approved", done: false } }
      : url.pathname === "/api/v1/lists/9" ? { list: { id: 9, project_id: denied ? 8 : 7, name: "Doing" } }
        : url.pathname === "/api/v1/tasks/5/comments" ? { comments: [{ id: 1, content: "Password: PlainPass123!\nDraft approved.", created_at: "2026-10-01" }] }
          : url.pathname === "/api/v1/tasks/5/attachments" ? { attachments: [{ id: 3, task_id: 5, file_name: "brief.pdf" }] } : null;
    assert.ok(payload, "Unexpected request: " + url.pathname);
    return Response.json(payload);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPat === undefined) delete process.env.HUBSTAFF_PAT_REFRESH_TOKEN; else process.env.HUBSTAFF_PAT_REFRESH_TOKEN = originalPat;
    if (originalToken === undefined) delete process.env.HUBSTAFF_ACCESS_TOKEN; else process.env.HUBSTAFF_ACCESS_TOKEN = originalToken;
  });
  const payload = {type:"threads.add_user_message",params:{input:{content:[{type:"input_text",text:"show comments and read the attachment on that task"}]}}};
  const query = hubstaffContextQuery(payload, `User: show comments on ${link}\nAssistant: Comments contain credentials and API keys.`);
  const snapshot = await loadHubstaffAssistantSnapshot(project, { query });
  assert.equal(snapshot.credentialAudit, null);
  assert.equal(snapshot.referencedTasks.length, 1);
  assert.equal(snapshot.referencedTasks[0].conversation.comments.length, 1);
  assert.match(snapshot.referencedTasks[0].conversation.comments[0].content, /Draft approved/);
  assert.doesNotMatch(JSON.stringify(snapshot), /PlainPass/);
  assert.equal(snapshot.referencedTasks[0].attachments.items[0].name, "brief.pdf");
  assert.equal(snapshot.referencedTasks[0].attachments.contentAvailable, false);
  assert.equal(paths.length, 4);
  paths.length = 0;
  denied = true;
  const forbidden = await loadHubstaffAssistantSnapshot(project, { query });
  assert.equal(forbidden.referencedTasks.length, 0);
  assert.deepEqual(paths, ["/api/v1/tasks/5", "/api/v1/lists/9"]);
  paths.length = 0;
  const unresolved = await loadHubstaffAssistantSnapshot(project, { query: "show me comments on that task" });
  assert.equal(unresolved.source.taskReferenceRequired, true);
  assert.deepEqual(paths, [], "An unresolved single-task request must not scan the whole board");
});
