import { randomBytes, randomUUID } from "node:crypto";

// Shared synthetic provisioning for the local CLI and real database acceptance.
// Callers supply canonical auth/Node connections; no provider or mail transport.
export async function createAgencyReviewFixture(db, auth, origin) {
  const identity = (await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
  if (identity.host !== "127.0.0.1" || !/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(identity.name) || new URL(origin).hostname !== "127.0.0.1") throw Error("Use a synthetic loopback fixture.");
  if ((await db.query("SELECT 1 FROM agency_platform.agencies WHERE slug IN ('s13-harbor','s13-summit')")).rowCount) throw Error("Preserve existing review agencies; use a fresh fixture.");
  const accounts = {};
  const names = { ownerA: "Harbor Owner", adminA: "Harbor Administrator", staffA: "Harbor Delivery", ownerB: "Summit Owner", staffB: "Summit Delivery", multi: "Multi Agency Staff", clientA: "Harbor Client Administrator", unrelated: "Unrelated User", invitee: "Invitation Recipient", platformOnly: "Platform Only" };
  for (const [key, label] of Object.entries(names)) {
    const username = "a13." + key.toLowerCase() + "." + randomBytes(5).toString("hex"), password = randomBytes(24).toString("hex");
    const created = await auth.api.signUpEmail({ body: { username, password, name: "Synthetic " + label, email: username + "@example.invalid" } });
    const user = (await db.query("INSERT INTO portal_users(id,external_id,display_name) SELECT coalesce(max(id),0)+1,$1,$2 FROM portal_users RETURNING id::text", [created.user.id, "Synthetic " + label])).rows[0];
    accounts[key] = { id: user.id, username, password, accountIdentifier: created.user.id, name: "Synthetic " + label };
  }
  await db.query("SELECT setval('portal_users_id_seq',greatest((SELECT last_value FROM portal_users_id_seq),(SELECT max(id) FROM portal_users)))");
  await db.query("SELECT setval('portal_clients_id_seq',greatest((SELECT last_value FROM portal_clients_id_seq),(SELECT max(id) FROM portal_clients)))");
  const agencies = [], clients = [];
  for (const [suffix, label, ownerKey, staffKey] of [["a", "Harbor", "ownerA", "staffA"], ["b", "Summit", "ownerB", "staffB"]]) {
    const agency = (await db.query("INSERT INTO agency_platform.agencies(slug,display_name) VALUES($1,$2) RETURNING id::text,slug,display_name name", ["s13-" + label.toLowerCase(), "Fictional " + label + " 13"])).rows[0]; agencies.push(agency);
    for (const key of [ownerKey, staffKey, "multi", ...(suffix === "a" ? ["adminA", "clientA"] : [])]) {
      const role = ["ownerA", "ownerB", "adminA"].includes(key) ? "agency_admin" : key === "clientA" ? "client_user" : "staff";
      await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,$3)", [agency.id, accounts[key].id, role]);
    }
    await db.query("BEGIN");
    try {
      await db.query("INSERT INTO agency_platform.agency_owners(agency_id,user_id,assigned_by) VALUES($1,$2,$2)", [agency.id, accounts[ownerKey].id]);
      await db.query("INSERT INTO agency_platform.agency_governance(agency_id,owner_id,enabled,support_name) VALUES($1,$2,true,$3)", [agency.id, accounts[ownerKey].id, "S13_" + suffix.toUpperCase() + "_SUPPORT"]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    for (const number of [1, 2]) {
      const client = (await db.query("INSERT INTO portal_clients(slug,display_name,portal_enabled,ai_enabled) VALUES($1,$2,true,true) RETURNING id::text,slug,display_name name", ["s13-" + suffix + number, label + " Client " + number])).rows[0];
      client.agencyId = agency.id; client.agencySlug = agency.slug; clients.push(client);
      await db.query("INSERT INTO agency_platform.client_ownership(agency_id,client_id) VALUES($1,$2)", [agency.id, client.id]);
      await db.query("UPDATE portal_clients SET updated_at=now() WHERE id=$1", [client.id]);
      if (number === 1) for (const key of [staffKey, "multi", ...(suffix === "a" ? ["clientA"] : [])]) {
        const role = key === "clientA" ? "client_admin" : "member";
        await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,$3,true)", [client.id, accounts[key].id, role]);
        await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,$2,$3,$4)", [agency.id, client.id, accounts[key].id, role === "client_admin" ? "manage" : "contribute"]);
      }
      await db.query("INSERT INTO agency_platform.agency_admin_audit(agency_id,client_id,actor_id,action,reason) VALUES($1,$2,$3,'fixture.created',$4)", [agency.id, client.id, accounts[ownerKey].id, "S13_" + suffix.toUpperCase() + number + "_AUDIT"]);
    }
    const own = clients.find(c => c.agencyId === agency.id);
    const request = randomUUID();
    await db.query("INSERT INTO portal_ai_usage_events(request_id,client_id,actor_user_id,action,status,input_tokens,output_tokens,total_tokens,started_at) VALUES($1,$2,$3,'client_ai.reply','succeeded',$4::bigint,5,$4::bigint+5,now())", [request, own.id, accounts[ownerKey].id, suffix === "a" ? 15 : 75]);
    await db.query("INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,reason,occurred_at) VALUES($1,$2,$3,'openai','synthetic','chat','succeeded','reported',$4,'Synthetic review only',now())", ["s13-" + suffix, request, own.id, suffix === "a" ? "0.12" : "99"]);
  }
  await db.query("INSERT INTO agency_platform.platform_memberships(user_id,role,assignment_reason) VALUES($1,'owner','Synthetic platform-only denial account')", [accounts.platformOnly.id]);
  return { origin, database: "/" + identity.name, agencies, clients, accounts };
}
