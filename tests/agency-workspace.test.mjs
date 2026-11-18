import { test } from "node:test";
import assert from "node:assert/strict";
import { selectWorkspace, trustedPortalHost, requestWorkspaceHeaders } from "../lib/workspace-selection.js";
import { inWorkspaceCache, workspaceCacheKey } from "../lib/workspace-cache.js";
import { workspaceSchemaReady } from "../lib/workspace-schema.js";

const rows = [{ id:"1", slug:"orchid", agency_id:"100", agency_slug:"aoc" },
  { id:"2", slug:"pine", agency_id:"200", agency_slug:"harbor" }];
test("only a pre-agency installation may use the legacy client boundary", async () => {
  const db = row => ({ query: async () => ({ rows: [row] }) });
  assert.equal(await workspaceSchemaReady(db({ foundation:false, ready:false })), false);
  await assert.rejects(workspaceSchemaReady(db({ foundation:true, ready:false })), e => e.publicDetails.status === 503);
  assert.equal(await workspaceSchemaReady(db({ foundation:true, ready:true })), true);
});
test("host must match the configured portal including its port", () => {
  for (const host of ["wrong.example", "portal.example:4000", "portal.example.evil", "", null]) {
    assert.equal(trustedPortalHost(host, "https://portal.example"), false);
  }
  assert.equal(trustedPortalHost("portal.example", "https://portal.example"), true);
});
test("URL, header and cookie selectors must agree with an assigned workspace", () => {
  const base = new Headers({cookie:"aoc_active_client=orchid; aoc_active_agency=aoc"});
  const url = new URL("https://portal.example/?workspaceAgency=harbor");
  assert.throws(() => selectWorkspace(rows, requestWorkspaceHeaders(url, base)), /Choose/);
  base.set("x-portal-agency", "aoc");
  assert.throws(() => requestWorkspaceHeaders(url, base));
  url.searchParams.set("workspaceAgency","aoc");
  assert.equal(selectWorkspace(rows,requestWorkspaceHeaders(url,base)).slug,"orchid");
  url.searchParams.append("workspaceAgency","aoc");
  assert.throws(() => requestWorkspaceHeaders(url,base));
  assert.throws(() => selectWorkspace(rows,new Headers({cookie:"aoc_active_client=%zz"})));
  assert.throws(() => selectWorkspace(rows,new Headers()), e => e.publicDetails.status===409);
});
test("concurrent calls for the same provider resource keep separate workspace cache keys", async () => {
  const cached = new Map();
  const read = async (scope, value) => inWorkspaceCache(scope,async () => {
    await Promise.resolve();
    const key = workspaceCacheKey("same-provider-resource");
    if (!cached.has(key)) cached.set(key,value);
    return cached.get(key);
  });
  assert.deepEqual(await Promise.all([read("A/1/U","one"),read("B/2/U","two")]),["one","two"]);
  assert.equal(await read("A/1/U","discard"),"one");
});
