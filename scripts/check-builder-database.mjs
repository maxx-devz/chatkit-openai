// All fixtures are TEMP tables in one rolled-back transaction. No application rows change.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { readBuilder, mutateBuilder } from "../lib/builder-repository.js";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query(`CREATE TEMP TABLE portal_users(id BIGINT PRIMARY KEY);
    CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,display_name TEXT,assistant_instructions TEXT,openai_vector_store_id TEXT,updated_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_chatkit_threads(client_id BIGINT,user_id BIGINT,id TEXT,PRIMARY KEY(client_id,user_id,id));
    INSERT INTO portal_users VALUES(1),(2);
    INSERT INTO portal_clients VALUES(1,'Test A','Original',NULL,NOW()),(2,'Test B','Other client',NULL,NOW());`);
  let schema = await readFile(new URL("../chatkit_backend/builder_schema.sql", import.meta.url), "utf8");
  schema = schema.replace("BEGIN;", "").replace("COMMIT;", "").replace("SET LOCAL search_path = public, pg_temp;", "SET LOCAL search_path = pg_temp, public;")
    .replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE");
  await db.query(schema);
  for (const name of ["portal_clients", "portal_assistant_configs", "portal_assistant_versions", "portal_assistant_files"]) {
    assert.equal((await db.query("SELECT relnamespace=pg_my_temp_schema() AS temporary FROM pg_class WHERE oid=$1::regclass", [name])).rows[0].temporary, true);
  }
  const mutate = (state, action, config = state.draft) => mutateBuilder(db, { clientId: state.clientId, revision: state.revision, action, config, liveFingerprint: state.liveFingerprint }, "1");
  const original = await readBuilder(db, "1");
  const saved = await mutate(original, "save", { ...original.draft, instructions: "New approved instructions", documents: true });
  assert.equal(saved.live.instructions, "Original", "Saving must not affect live behavior");
  assert.equal(saved.publishedVersion, 0);
  await assert.rejects(mutate(original, "save"), (error) => error.publicDetails.status === 409);
  const published = await mutate(saved, "publish");
  assert.equal(published.live.instructions, "New approved instructions");
  assert.equal(published.live.documents, true);
  assert.equal(published.publishedVersion, 1);
  assert.equal(published.history.length, 1);
  assert.equal(published.conflict, false);
  assert.equal((await readBuilder(db, "2")).live.instructions, "Other client");
  await assert.rejects(mutate(saved, "publish"), (error) => error.publicDetails.status === 409);
  await db.query("UPDATE portal_clients SET assistant_instructions='External admin edit' WHERE id=1");
  const changed = await readBuilder(db, "1");
  assert.equal(changed.conflict, true);
  await assert.rejects(mutate(changed, "publish"), (error) => error.publicDetails.status === 409);
  const reset = await mutate(changed, "reset");
  assert.equal(reset.draft.instructions, "External admin edit");
  assert.equal(reset.conflict, false);
  const restored = await mutate(reset, "save", published.history[0].config);
  const republished = await mutate(restored, "publish");
  assert.equal(republished.publishedVersion, 2);
  assert.equal(republished.live.instructions, "New approved instructions");
  console.log("Builder SQL passed: draft isolation, stale edits, atomic publishing, client isolation, external changes, version restore.");
} finally { await db.query("ROLLBACK").catch(() => {}); await db.end(); }
