import { seedBrandingFixture } from "./agency-branding-fixture.mjs";
import { prepareAccountSecurity, login } from "../tests/account-security/fixture.mjs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";
import { createSpecialistReviewFixture } from "./specialist-review-fixture.mjs";
async function main() {
  const [flag, name, ...rest] = process.argv.slice(2);
  const runtime = new URL(process.env.DATABASE_URL), operator = new URL(approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, name));
  if (flag !== "--confirm-database" || rest.length || !/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(name) || runtime.hostname !== "127.0.0.1" || operator.hostname !== "127.0.0.1" || runtime.search || operator.search || runtime.host !== operator.host || runtime.pathname !== operator.pathname || runtime.username === operator.username || !["http://127.0.0.1:3004"].includes(process.env.BETTER_AUTH_URL) || process.env.PORTAL_ACCOUNT_SECURITY_ENABLED !== "true" || (process.env.BETTER_AUTH_SECRET || "").length < 32) throw Error("Require the approved synthetic loopback profile.");
  const directory = new URL("../.tmp/branding-review/", import.meta.url), output = new URL("accounts.json", directory);
  if (await access(output).then(() => true, () => false)) throw Error("Preserve the existing private specialist account file.");
  process.env.DATABASE_URL = operator.href;
  const { databasePool } = await import("../lib/postgres.js");
  const { createPortalAuth, closeAuthDatabase } = await import("../lib/auth.js");
  let db;
  try {
    db = await databasePool.connect();
    if (!(await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='012_agency_branding'")).rowCount) throw Error("Migrate Stage 15 first.");
    const auth = createPortalAuth({ allowAccountCreation: true, useNextCookies: false, operatorDatabase: true });
    const fixture = await createSpecialistReviewFixture(db, auth, process.env.BETTER_AUTH_URL);
    await prepareAccountSecurity(db, auth, fixture, process.env.BETTER_AUTH_URL);
    for (let i=0; i<2; i++) {
      const owner=i?fixture.accounts.ownerB:fixture.accounts.ownerA;
      const signed = await login(auth,owner,process.env.BETTER_AUTH_URL);
      const session=(await auth.api.getSession({headers:new Headers({cookie:signed.cookie})})).session.id;
      const command={...fixture.assignmentInputs[i],action:"assignment.create",operation:crypto.randomUUID(),reason:"Synthetic local agency approval"};
      const result=(await db.query("SELECT agency_platform.specialist_admin_change($1,$2,$3,$4::jsonb) data",[owner.accountIdentifier,session,fixture.agencies[i].id,JSON.stringify(command)])).rows[0].data;
      (fixture.active ||= []).push(result.id);
    }
    await seedBrandingFixture(db,fixture);
    await mkdir(directory, { recursive: true }); await writeFile(output, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Synthetic account-security accounts saved privately in .tmp/branding-review/accounts.json. No invitations sent or existing users promoted.");
  } finally { db?.release(); await closeAuthDatabase(); }
}
main().catch(error => { console.error("Agency review seed stopped", safeDatabaseCode(error)); process.exitCode = 1; });
