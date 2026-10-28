// Synthetic portable-PostgreSQL integration check. All schema/data roll back.
// No Google, Hubstaff or model call is made, and no credentials/content are printed.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { databasePool } from "../lib/database.js";
import { driveConfiguration } from "../lib/drive-source-policy.js";
import { preparedBinding, encodePreparedDocuments, savePreparedPublication } from "../lib/prepared-source-store.js";
import { loadPreparedSourceContext } from "../lib/prepared-source-context.js";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
const originalQuery = databasePool.query;
try {
  await db.connect();
  await db.query("BEGIN");
  const schema = "check_sources_" + randomBytes(8).toString("hex");
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query(`CREATE TABLE portal_users(id BIGINT PRIMARY KEY);
    CREATE TABLE portal_clients(id BIGINT PRIMARY KEY, display_name TEXT);
    CREATE TABLE portal_admins(user_id BIGINT PRIMARY KEY, is_active BOOLEAN);
    INSERT INTO portal_users VALUES(1),(2);
    INSERT INTO portal_admins VALUES(1,TRUE),(2,TRUE);
    INSERT INTO portal_clients VALUES(101,'Synthetic A'),(102,'Synthetic B')`);
  for (const name of ["drive-source-schema.sql", "prepared-source-schema.sql"]) {
    const sql = (await readFile(new URL("../database/" + name, import.meta.url), "utf8"))
      .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
    await db.query(sql);
  }
  // Simulate a pre-shared installation, then verify a non-destructive upgrade.
  await db.query(`ALTER TABLE portal_source_publications DROP CONSTRAINT portal_source_audience;
    ALTER TABLE portal_source_publications ADD CONSTRAINT portal_source_audience CHECK (
      (audience='admin' AND client_id IS NULL) OR (client_id IS NOT NULL AND audience='client:' || client_id::text));
    INSERT INTO portal_source_publications(owner_id,audience,additional_instructions) VALUES(1,'admin','Existing private guidance')`);
  const migration = (await readFile(new URL("../database/prepared-source-schema.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
  await db.query(migration);
  await db.query(migration);
  assert.equal((await db.query("SELECT additional_instructions FROM portal_source_publications WHERE owner_id=1 AND audience='admin'")).rows[0].additional_instructions, "Existing private guidance");
  const config = driveConfiguration();
  const connected = new Date();
  const binding = preparedBinding({ google_email: config.email, root_folder_id: config.rootId,
    oauth_client_id: config.clientId, connected_at: connected, administrator_active: true });
  const documents = [
    { id: "shared_rules_123", name: "Synthetic shared rules", path: "Company / Rules", version: "1", text: "State evidence limitations.", folders: [] },
    { id: "shared_doc_123", name: "Synthetic services", path: "Company / Services", version: "1", text: "Synthetic company website services.", folders: [{ id: "shared_folder_123", path: "Company" }] },
    { id: "private_doc_123", name: "Synthetic private", path: "Private / Notes", version: "1", text: "PRIVATE_ONLY_MARKER website", folders: [{ id: "private_folder_123", path: "Private" }] },
  ];
  await db.query(`INSERT INTO portal_drive_source_connections(owner_id,google_email,google_subject,oauth_client_id,root_folder_id,encrypted_refresh_token,connected_at)
    VALUES(1,$1,'synthetic-subject',$2,$3,'unused-no-network-token',$4)`, [config.email, config.clientId, config.rootId, connected]);
  await db.query(`INSERT INTO portal_prepared_source_indexes(owner_id,binding,encrypted_documents,checked_at)
    VALUES(1,$1,$2,NOW())`, [binding, encodePreparedDocuments("1", binding, documents)]);
  // Bind the real repositories to this one rollback-only connection.
  let queryQueue = Promise.resolve();
  databasePool.query = (...args) => {
    const result = queryQueue.then(() => db.query(...args));
    queryQueue = result.catch(() => {});
    return result;
  };
  await savePreparedPublication("1", { action: "save", clientId: "clients", enabled: true,
    referencePaths: ["shared_folder_123"], instructionIds: ["shared_rules_123"], additionalInstructions: "",
    generalReferences: true, consent: true });
  await db.query("SAVEPOINT duplicate_shared");
  await assert.rejects(db.query("INSERT INTO portal_source_publications(owner_id,audience) VALUES(2,'clients')"), error => error.code === "23505");
  await db.query("ROLLBACK TO SAVEPOINT duplicate_shared");
  await savePreparedPublication("1", { action: "save", clientId: null, enabled: true,
    referencePaths: ["private_folder_123"], instructionIds: [], additionalInstructions: "",
    generalReferences: true, consent: true });
  for (const clientId of ["101", "102"]) {
    const result = await loadPreparedSourceContext({ clientId }, "website", "general");
    assert.match(result.instructions, /State evidence limitations/);
    assert.equal(result.references.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ONLY_MARKER/);
  }
  await db.query("INSERT INTO portal_clients VALUES(103,'Future synthetic client')");
  assert.equal((await loadPreparedSourceContext({ clientId: "103" }, "website")).references.length, 1);
  assert.match(JSON.stringify(await loadPreparedSourceContext({ ownerId: "1" }, "website")), /PRIVATE_ONLY_MARKER/);
  assert.doesNotMatch(JSON.stringify(await loadPreparedSourceContext({ ownerId: "2" }, "website")), /PRIVATE_ONLY_MARKER/);
  // The dedicated parent becomes shared only after this explicit root approval.
  await savePreparedPublication("1", { action: "save", clientId: "clients", enabled: true,
    referencePaths: [""], instructionIds: [], additionalInstructions: "", generalReferences: true, consent: true });
  const automatic = await loadPreparedSourceContext({ clientId: "101" }, "services website");
  assert.match(automatic.instructions, /source of truth/);
  assert.ok(automatic.references.every(reference => reference.usage === "company_guidance"));
  await assert.rejects(savePreparedPublication("2", { action: "disable", clientId: "clients" }), /another administrator/);
  await db.query("UPDATE portal_prepared_source_indexes SET checked_at=NOW()-INTERVAL '16 minutes'");
  await assert.rejects(loadPreparedSourceContext({ clientId: "101" }, "website"), /synchronization/);
  await savePreparedPublication("1", { action: "disable", clientId: "clients" });
  assert.deepEqual(await loadPreparedSourceContext({ clientId: "101" }, "website"), { instructions: "", references: [], checkedAt: null });
  console.log("PASS real PostgreSQL: migration idempotence, shared publication, future clients, private isolation, owner enforcement, stale-source blocking and pause. All synthetic data rolls back.");
} catch (error) {
  console.error("Shared-source database check failed", { code: error.code || error.name || "unknown" });
  process.exitCode = 1;
} finally {
  databasePool.query = originalQuery;
  await db.query("ROLLBACK").catch(() => {});
  await db.end();
  await databasePool.end();
}
