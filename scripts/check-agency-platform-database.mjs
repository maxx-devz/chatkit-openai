// Real PostgreSQL acceptance fixture. NEVER falls back to DATABASE_URL.
// Needs a dedicated empty disposable DB and permission to create fixture roles.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { applyAgencyMigration } from "./migrate-agency-platform.mjs";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";
import { withAgencyScope, AgencyScopeError } from "../lib/agency-scope.js";

const identifier = value => '"' + value.replaceAll('"', '""') + '"';

async function checkDatabase(connectionString) {
  const admin = new pg.Client({ connectionString, connectionTimeoutMillis: 8000 });
  const pools = [];
  const loginRoles = [];
  const checks = [];
  let fixtureCreated = false;
  let groupsCreated = false;
  let database;
  const ownerQuery = async (sql, values) => {
    await admin.query("BEGIN");
    try {
      await admin.query("SET LOCAL ROLE aoc_agency_owner");
      const result = await admin.query(sql, values);
      await admin.query("COMMIT");
      return result;
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
  };
  try {
    await admin.connect();
    const { rows: [target] } = await admin.query(`SELECT current_database() AS database,
      (r.rolsuper OR r.rolcreaterole) AS role_setup,
      pg_has_role(current_user,d.datdba,'MEMBER') AS database_owner
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`);
    database = target.database;
    assert.equal(database, decodeURIComponent(new URL(connectionString).pathname.slice(1)));
    assert.ok(target.role_setup && target.database_owner, "Fixture requires authorized database-owner/role setup privileges.");
    const { rows: [empty] } = await admin.query(`SELECT
      NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f'))
      AND to_regnamespace('agency_platform') IS NULL
      AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('aoc_agency_owner','aoc_agency_runtime')) AS safe`);
    assert.ok(empty.safe, "Fixture requires an empty database and unused agency group-role names. Existing objects are never overwritten.");
    await admin.query("BEGIN");
    try {
      await admin.query(await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"));
      await admin.query(await readFile(new URL("../database/client-access-schema.sql", import.meta.url), "utf8"));
      await admin.query("COMMIT");
      fixtureCreated = true;
    } catch (error) { await admin.query("ROLLBACK"); throw error; }
    // Only this empty, explicitly approved fixture DB is changed. Runtime roles
    // must not have public schema CREATE, including through PUBLIC on older PG.
    await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await admin.query(await readFile(new URL("../database/agency-platform/000_role_setup.sql", import.meta.url), "utf8"));
    groupsCreated = true;
    await applyAgencyMigration(admin);
    await applyAgencyMigration(admin);
    checks.push("versioned migration and identical rerun");

    const { rows: users } = await admin.query(`INSERT INTO public.portal_users(external_id,display_name)
      VALUES('stage03-fictional-mira','Mira / Harbor'),('stage03-fictional-ben','Ben / Summit') RETURNING id`);
    const [mira, ben] = users.map(u => u.id);
    const { rows: clients } = await admin.query(`INSERT INTO public.portal_clients(slug,display_name)
      VALUES('stage03-orchid','Orchid Shop'),('stage03-birch','Birch Shop'),('stage03-pine','Pine Shop') RETURNING id`);
    const [a1, a2, b1] = clients.map(c => c.id);
    // Deliberately broad LEGACY memberships: these alone must not authorize an
    // agency path. This makes the composite ownership check independently useful.
    for (const user of [mira, ben]) for (const client of [a1, a2, b1]) {
      await admin.query("INSERT INTO public.portal_memberships(client_id,user_id,role) VALUES($1,$2,'member')", [client, user]);
    }
    const { rows: agencies } = await ownerQuery(`INSERT INTO agency_platform.agencies(slug,display_name)
      VALUES('stage03-harbor','Harbor Agency'),('stage03-summit','Summit Agency') RETURNING id`);
    const [agencyA, agencyB] = agencies.map(a => a.id);
    await ownerQuery(`INSERT INTO agency_platform.memberships(agency_id,user_id,role)
      VALUES($1,$2,'staff'),($3,$4,'staff')`, [agencyA, mira, agencyB, ben]);
    await ownerQuery(`INSERT INTO agency_platform.client_ownership(client_id,agency_id)
      VALUES($1,$2),($3,$2),($4,$5)`, [a1, agencyA, a2, b1, agencyB]);
    await ownerQuery(`INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level)
      VALUES($1,$2,$3,'contribute'),($4,$5,$6,'contribute')`, [agencyA, a1, mira, agencyB, b1, ben]);
    await assert.rejects(ownerQuery(`INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level)
      VALUES($1,$2,$3,'read')`, [agencyA, b1, mira]),
    e => e.code === "23503" && e.constraint === "agency_client_access_owner_fk");
    checks.push("two fictional agencies reject mismatched client ownership");
    await assert.rejects(ownerQuery(`INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level)
      VALUES($1,$2,$3,'read')`, [agencyA, a1, ben]),
    e => e.code === "23503" && e.constraint === "agency_client_access_member_fk");

    const aAsset = randomUUID(), bAsset = randomUUID(), common = randomUUID();
    const seeds = [
      [aAsset,"generated_asset","a-asset","client",agencyA,a1,mira,false],
      [bAsset,"generated_asset","b-asset","client",agencyB,b1,ben,false],
      [common,"source_pack","approved-common-manual","platform_common",null,null,mira,true],
      [randomUUID(),"source_pack","private-summit-playbook","agency",agencyB,null,ben,false],
      [randomUUID(),"credential","private-provider-reference","platform_private",null,null,mira,false],
      [randomUUID(),"source_pack","unreviewed-legacy-pack","quarantined",null,null,mira,false],
      [randomUUID(),"billing_reference","private-billing-reference","platform_private",null,null,mira,false],
      [randomUUID(),"credential","client-credential-reference","client",agencyA,a1,mira,false],
      [randomUUID(),"billing_reference","agency-billing-reference","agency",agencyA,null,mira,false],
      [randomUUID(),"audit_record","client-audit-reference","client",agencyA,a1,mira,false],
    ];
    for (const [id,kind,key,scope,agency,client,creator,approved] of seeds) {
      await ownerQuery(`INSERT INTO agency_platform.resources(id,resource_kind,resource_key,scope_kind,
        agency_id,client_id,created_by,approved_by,approved_at,approval_reference)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id,kind,key,scope,agency,client,creator,approved ? creator : null,
        approved ? new Date() : null,approved ? "fictional-common-approval" : null]);
    }
    await assert.rejects(ownerQuery(`INSERT INTO agency_platform.resources
      (id,resource_kind,resource_key,scope_kind,agency_id,client_id,created_by)
      VALUES($1,'generated_asset','wrong-owner','client',$2,$3,$4)`, [randomUUID(),agencyA,b1,mira]),
    e => e.code === "23503" && e.constraint === "agency_resource_owner_fk");
    for (const kind of ["source_pack", "credential"]) {
      await assert.rejects(ownerQuery(`INSERT INTO agency_platform.resources
        (id,resource_kind,resource_key,scope_kind,created_by)
        VALUES($1,$2,'unapproved-common','platform_common',$3)`, [randomUUID(),kind,mira]),
      e => e.code === "23514");
    }
    await assert.rejects(ownerQuery(`INSERT INTO agency_platform.resources
      (id,resource_kind,resource_key,scope_kind,created_by,approved_by,approved_at,approval_reference)
      VALUES($1,'credential','credential-never-common','platform_common',$2,$2,now(),'fictional-approval')`, [randomUUID(),mira]),
    e => e.code === "23514");
    await assert.rejects(ownerQuery(`INSERT INTO agency_platform.resources
      (id,resource_kind,resource_key,scope_kind,client_id,created_by)
      VALUES($1,'generated_asset','null-agency','client',$2,$3)`, [randomUUID(),a1,mira]),
    e => e.code === "23514");
    checks.push("resource ownership and explicit common-source approval constraints");

    for (const agency of [agencyA, agencyB]) {
      const role = "aoc_s03_" + randomBytes(8).toString("hex");
      const password = randomBytes(24).toString("hex");
      // Both interpolated strings are generated hexadecimal identifiers/secrets,
      // never input, environment values or output. Utility DDL has no bind params.
      await admin.query(`CREATE ROLE ${identifier(role)} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}' IN ROLE aoc_agency_runtime`);
      loginRoles.push(role);
      await ownerQuery("INSERT INTO agency_platform.database_principals(login_role,agency_id) VALUES($1,$2)", [role, agency]);
      const url = new URL(connectionString);
      url.username = role;
      url.password = password;
      url.searchParams.delete("options");
      pools.push(new pg.Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 8000 }));
    }
    const [poolA, poolB] = pools;
    const scopeA = { agencyId: agencyA, actorId: mira, clientId: a1 };
    const scopeB = { agencyId: agencyB, actorId: ben, clientId: b1 };
    const visible = async (pool, scope) => withAgencyScope(pool, scope,
      async db => (await db.query("SELECT id FROM agency_platform.resources ORDER BY id")).rows.map(r => r.id));
    assert.deepEqual((await visible(poolA, scopeA)).sort(), [aAsset,common].sort());
    assert.equal((await visible(poolB, scopeB)).includes(bAsset), true);
    assert.equal((await visible(poolB, scopeB)).includes(aAsset), false);
    await assert.rejects(withAgencyScope(poolA, scopeB, () => assert.fail("foreign work")), AgencyScopeError);
    await assert.rejects(withAgencyScope(poolA, { ...scopeA, clientId: a2 }, () => assert.fail("unassigned work")), AgencyScopeError);
    await assert.rejects(poolA.query("SELECT * FROM public.portal_clients"), e => e.code === "42501");
    await assert.rejects(poolA.query("SELECT * FROM agency_platform.database_principals"), e => e.code === "42501");
    await assert.rejects(poolA.query("SET ROLE aoc_agency_owner"), e => e.code === "42501");
    await assert.rejects(poolA.query("TRUNCATE agency_platform.resources"), e => e.code === "42501");
    checks.push("ordinary runtime reads own client/common pack; denies A2/B1 and private backing tables");

    const inserted = randomUUID();
    await withAgencyScope(poolA, scopeA, async db => {
      await db.query(`INSERT INTO agency_platform.resources
        (id,resource_kind,resource_key,scope_kind,agency_id,client_id,created_by)
        VALUES($1,'generated_asset',$2,'client',$3,$4,$5)`, [inserted,inserted,agencyA,a1,mira]);
      assert.equal((await db.query("UPDATE agency_platform.resources SET resource_key='foreign-update' WHERE id=$1", [bAsset])).rowCount, 0);
      assert.equal((await db.query("DELETE FROM agency_platform.resources WHERE id=$1", [bAsset])).rowCount, 0);
      assert.equal((await db.query("DELETE FROM agency_platform.resources WHERE id=$1", [inserted])).rowCount, 1);
    });
    await assert.rejects(withAgencyScope(poolA, scopeA, db => db.query(`INSERT INTO agency_platform.resources
      (id,resource_kind,resource_key,scope_kind,agency_id,client_id,created_by)
      VALUES($1,'generated_asset','foreign-insert','client',$2,$3,$4)`, [randomUUID(),agencyB,b1,mira])), e => e.code === "42501");
    await assert.rejects(withAgencyScope(poolA, scopeA, db => db.query(
      "UPDATE agency_platform.resources SET agency_id=$1,client_id=$2 WHERE id=$3", [agencyB,b1,aAsset])), e => e.code === "42501");
    checks.push("own writes work; foreign insert/update/delete and ownership changes are denied");

    const forged = await poolA.connect();
    try {
      await forged.query("BEGIN");
      await forged.query(`SELECT set_config('aoc.agency_id',$1,true),set_config('aoc.actor_id',$2,true),
        set_config('aoc.client_id',$3,true)`, [agencyB,ben,b1]);
      assert.equal((await forged.query("SELECT count(*)::int AS n FROM agency_platform.resources")).rows[0].n, 0);
    } finally { await forged.query("ROLLBACK"); forged.release(); }
    const reusedBackend = (await poolA.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    for (const fail of [false,true]) {
      const work = withAgencyScope(poolA, scopeA, async db => {
        assert.equal((await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,reusedBackend);
        if (fail) throw new Error("fictional rollback");
      });
      if (fail) await assert.rejects(work); else await work;
      const { rows: [clean] } = await poolA.query(`SELECT
        NULLIF(current_setting('aoc.agency_id',true),'') IS NULL AS agency,
        NULLIF(current_setting('aoc.actor_id',true),'') IS NULL AS actor,
        NULLIF(current_setting('aoc.client_id',true),'') IS NULL AS client,
        pg_backend_pid() AS pid`);
      assert.deepEqual(clean, { agency:true,actor:true,client:true,pid:reusedBackend });
      assert.equal((await poolA.query("SELECT count(*)::int AS n FROM agency_platform.resources")).rows[0].n, 0);
    }
    checks.push("forged GUC scope denied; max-one-connection pool clean after commit and rollback");

    // Deliberately set session-wide state in this synthetic fixture. The helper
    // must reject and discard that socket, then give the next request clean state.
    await assert.rejects(withAgencyScope(poolA,scopeA,db => db.query(
      "SELECT set_config('aoc.agency_id',$1,false)",[agencyA])),AgencyScopeError);
    const {rows:[replacement]} = await poolA.query(`SELECT pg_backend_pid() AS pid,
      NULLIF(current_setting('aoc.agency_id',true),'') IS NULL AS clean`);
    assert.notEqual(replacement.pid,reusedBackend);
    assert.equal(replacement.clean,true);
    assert.equal((await visible(poolA,scopeA)).includes(aAsset),true);
    checks.push("session pollution discards the backend and the next request receives clean scope");

    await admin.query("UPDATE public.portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2", [a1,mira]);
    await assert.rejects(withAgencyScope(poolA, scopeA, () => assert.fail("inactive legacy membership")), AgencyScopeError);
    await admin.query("UPDATE public.portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2", [a1,mira]);
    await ownerQuery("UPDATE agency_platform.memberships SET is_active=false WHERE agency_id=$1 AND user_id=$2", [agencyA,mira]);
    await assert.rejects(withAgencyScope(poolA, scopeA, () => assert.fail("inactive agency membership")), AgencyScopeError);
    await ownerQuery("UPDATE agency_platform.memberships SET is_active=true WHERE agency_id=$1 AND user_id=$2", [agencyA,mira]);
    checks.push("legacy and agency membership revocation takes effect");

    const { rows: [rls] } = await admin.query(`SELECT count(*)::int AS n,
      bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='agency_platform' AND c.relkind='r'`);
    assert.equal(rls.n, 8);
    assert.equal(rls.forced, true);
    assert.equal((await ownerQuery("SELECT count(*)::int AS n FROM agency_platform.resources")).rows[0].n, seeds.length);
    const privilegedPool = new pg.Pool({ connectionString, max:1, connectionTimeoutMillis:8000 });
    pools.push(privilegedPool);
    await assert.rejects(withAgencyScope(privilegedPool, scopeA, () => assert.fail("privileged runtime")), AgencyScopeError);
    checks.push("FORCE RLS metadata, explicit owner exception and privileged-runtime rejection");
    return checks;
  } finally {
    await Promise.all(pools.map(pool => pool.end()));
    try {
      if (fixtureCreated) {
        await admin.query("RESET ROLE");
        await admin.query("DROP SCHEMA IF EXISTS agency_platform CASCADE");
        await admin.query(`DROP TABLE IF EXISTS public.portal_client_access_audit,
          public.portal_knowledge_items,public.portal_workspace_snapshots,
          public.portal_memberships,public.portal_users,public.portal_clients CASCADE`);
      }
      for (const role of loginRoles) await admin.query(`DROP ROLE ${identifier(role)}`);
      if (groupsCreated) {
        // Undo only the newly created fixture owner's global function defaults,
        // so that dropping its role does not leave a pg_default_acl dependency.
        await admin.query("ALTER DEFAULT PRIVILEGES FOR ROLE aoc_agency_owner GRANT EXECUTE ON FUNCTIONS TO PUBLIC");
        await admin.query("REVOKE USAGE ON SCHEMA public FROM aoc_agency_owner");
        await admin.query(`REVOKE CREATE ON DATABASE ${identifier(database)} FROM aoc_agency_owner`);
        await admin.query("DROP ROLE aoc_agency_runtime, aoc_agency_owner");
      }
    } finally { await admin.end(); }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!process.env.AGENCY_TEST_DATABASE_URL && args.length === 0) {
    console.log("SKIPPED: no AGENCY_TEST_DATABASE_URL; real migration/RLS/role/pool verification remains pending. DATABASE_URL is ignored.");
    return;
  }
  if (args.length !== 3 || args[0] !== "--confirm-database" || args[2] !== "--allow-role-fixtures") {
    throw new Error("Confirm the empty disposable DB and explicitly allow fixture role creation before connecting.");
  }
  const target = approvedDatabaseTarget(process.env.AGENCY_TEST_DATABASE_URL,args[1]);
  const checks = await checkDatabase(target);
  console.log(`PASS: ${checks.length} real PostgreSQL agency scenarios; fictional fixtures cleaned up. No provider or production data used.`);
}
main().catch(error => {
  console.error(`Agency database verification stopped (${safeDatabaseCode(error)}). Review the approved empty target, role privileges and cleanup privately.`);
  process.exitCode = 1;
});
