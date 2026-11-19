import { access, mkdir, writeFile } from "node:fs/promises";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";
import { createSpecialistReviewFixture } from "./specialist-review-fixture.mjs";
async function main() {
  const [flag, name, ...rest] = process.argv.slice(2);
  const runtime = new URL(process.env.DATABASE_URL), operator = new URL(approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, name));
  if (flag !== "--confirm-database" || rest.length || !/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(name) || runtime.hostname !== "127.0.0.1" || operator.hostname !== "127.0.0.1" || runtime.search || operator.search || runtime.host !== operator.host || runtime.pathname !== operator.pathname || runtime.username === operator.username || !["http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3002"].includes(process.env.BETTER_AUTH_URL) || (process.env.BETTER_AUTH_SECRET || "").length < 32) throw Error("Require the approved synthetic loopback profile.");
  const directory = new URL("../.tmp/specialist-review/", import.meta.url), output = new URL("accounts.json", directory);
  if (await access(output).then(() => true, () => false)) throw Error("Preserve the existing private specialist account file.");
  process.env.DATABASE_URL = operator.href;
  const { databasePool } = await import("../lib/postgres.js");
  const { createPortalAuth, closeAuthDatabase } = await import("../lib/auth.js");
  let db;
  try {
    db = await databasePool.connect();
    if (!(await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='010_specialist_assignments'")).rowCount) throw Error("Migrate Stage 13A first.");
    const fixture = await createSpecialistReviewFixture(db, createPortalAuth({ allowAccountCreation: true, useNextCookies: false, operatorDatabase: true }), process.env.BETTER_AUTH_URL);
    for (let i=0; i<2; i++) {
      const owner=i?fixture.accounts.ownerB:fixture.accounts.ownerA;
      const auth=createPortalAuth({allowAccountCreation:false,useNextCookies:false,operatorDatabase:true});
      const login=await auth.api.signInUsername({body:{username:owner.username,password:owner.password},headers:new Headers({origin:process.env.BETTER_AUTH_URL}),asResponse:true});
      if(login.status!==200)throw Error("Synthetic approval session unavailable.");
      const session=(await db.query('SELECT id FROM "session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[owner.accountIdentifier])).rows[0].id;
      const command={...fixture.assignmentInputs[i],action:"assignment.create",operation:crypto.randomUUID(),reason:"Synthetic local agency approval"};
      const result=(await db.query("SELECT agency_platform.specialist_admin_change($1,$2,$3,$4::jsonb) data",[owner.accountIdentifier,session,fixture.agencies[i].id,JSON.stringify(command)])).rows[0].data;
      (fixture.active ||= []).push(result.id);
    }
    await mkdir(directory, { recursive: true }); await writeFile(output, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Synthetic specialist accounts saved privately in .tmp/specialist-review/accounts.json. No invitations sent or existing users promoted.");
  } finally { db?.release(); await closeAuthDatabase(); }
}
main().catch(error => { console.error("Agency review seed stopped", safeDatabaseCode(error)); process.exitCode = 1; });
