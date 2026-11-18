# Stage 03 database foundation — verified on disposable local PostgreSQL

> Primary project handoff: use `C:\Users\MY PC\Desktop\AI\portal`. The results below were recorded in the AOC source worktree. Stage 03–04 code has not yet been imported into this primary checkout. See [HANDOFF](HANDOFF.md) for exact Git files, local-only verification limits and the Stage 05 stop gate.

The implementation remains on `feat/agency-platform-isolation` from
`916bbf5b781ea0dd7b3b685d5517694dad4185a7`, in the isolated
`.tmp/agency-platform-isolation` worktree. After initial preparation, the owner
approved a **new disposable local PostgreSQL database**. Local migration and
acceptance verification is now complete. The configured Neon database, original
dirty `master`, local fixes and `.env.local` were untouched. No provider call,
payment, real message, customer-data backfill or agency-mode activation occurred.

## Additive ownership structure

All new objects live in `agency_platform`. Existing `public.portal_clients`,
`public.portal_users` and `public.portal_memberships` are preserved. No legacy
customer is assigned an agency automatically. No staffing/HR/payroll data model,
subscription enforcement or public agency interface is introduced.

| New table | Purpose and invariant |
| --- | --- |
| `agencies` | Agency identity/status; no approved brand or subscription inferred. |
| `memberships` | Active user/agency relationship, independent of staffing and legacy client membership. Ordinary staff do not acquire every client. |
| `client_ownership` | One owning agency per adopted client; unique `(agency_id, client_id)`. Unadopted legacy clients are unavailable through the new foundation. |
| `client_access` | Composite FKs require matching client owner, same-agency user membership and an existing legacy client/user membership. Runtime writes to these grants are prohibited. |
| `database_principals` | Protected mapping from an authenticated PostgreSQL LOGIN name to one agency. No ordinary runtime SELECT or mutation. |
| `resources` | Explicit classification/locator metadata, not credential values, document/file bodies or authority to read a backing object. The client FK must match its agency owner. |
| `legacy_classifications` | Operator-only inventory defaults for legacy sources, credentials, audits, generated files, financial references, Google/Hubstaff data and Internal records. It does not grant data access or certify individual legacy records. |
| `schema_migrations` | Version, SHA-256 and application timestamp; the runner rejects a changed checksum rather than rewriting migration history. |

The migration is versioned as
[001_agency_foundation.sql](../../database/agency-platform/001_agency_foundation.sql).
Use its runner for identical reruns; the raw CREATE statements are not a general
rerunnable dashboard script. Legacy client deletion is restricted after explicit
adoption while ownership exists; a later audited lifecycle must handle that
deliberately. No existing adopted rows are created by this migration.

## Explicit global versus customer ownership

| Resource classification | Required shape and read rule |
| --- | --- |
| `client` | Non-null agency and client with a matching ownership FK. Runtime needs active agency/legacy membership, explicit client grant and the selected client context. |
| `agency` | Non-null agency, null client. Metadata is visible only in that agency's validated context; this is not a grant to read every referenced source body. |
| `platform_common` | Null agency/client only with explicit type, reviewer, approval timestamp and reference. Only source-pack metadata can use this classification, and a valid agency context is still required. No automatic global pack adoption. |
| `platform_private` | Explicit private global/operator scope; never ordinary runtime-readable. Credentials and billing references cannot become common by leaving ownership empty. |
| `quarantined` | Unreviewed legacy/unknown ownership; no ordinary runtime read. Missing classification never falls back to public/global. |

The inventory treats encrypted platform AI/settings/integration credentials as
private operations data. Client audit/cost/credit/report references remain
client-scoped but unbound until explicitly reviewed; archived/null-client costs
stay private. Generated files retain client/user/thread/builder provenance.
The existing shared `clients` source audience is quarantined for agency adoption;
it is not silently republished or altered. Internal HR/PM/personnel records remain
outside agency mode. Customer-data access, software ownership and branding remain
the separate contracts in [DECISIONS](DECISIONS.md).

## Database enforcement and its limits

Every new table has ENABLE and FORCE RLS. Runtime receives narrow SELECT grants;
only client-scoped generated-asset **metadata** has ordinary write policies.
There is no runtime DDL, TRUNCATE, REFERENCES, grant-management, principal access
or legacy backing-table permission. Credential, audit and billing-reference
metadata is denied even with matching agency/client ownership; specialized read
permissions are not implemented. Ordinary code cannot create an agency or
publish common knowledge through this role.

The protected login mapping binds `session_user` to one agency. User-set
`aoc.agency_id`, `aoc.actor_id` and `aoc.client_id` settings are selectors that
must match that mapping, active memberships and a client grant; they do not grant
authority. Changing the settings to Agency B on Agency A's connection must deny
all scoped reads. An actor ID still must come from authenticated application
context: a database agency login does not authenticate an individual user.

Runtime checks reject login roles with owner/privileged memberships, superuser,
BYPASSRLS, role/database creation or replication attributes, public/new-schema
CREATE, database CREATE, ownership of new tables/functions, or direct privileges
on legacy public tables. Do not fix rejection by
relaxing the check or granting a broad service role.

`aoc_agency_owner` is an explicit trusted control-plane exception with full new
table access, including in fixed-search-path SECURITY DEFINER lookup functions.
An owner can alter policies; superusers/BYPASSRLS bypass RLS. FORCE is **not** a
protection claim for those credentials. Runtime must never receive that role.
These semantics follow PostgreSQL's
[row security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[session identity rules](https://www.postgresql.org/docs/current/functions-info.html),
and [SECURITY DEFINER guidance](https://www.postgresql.org/docs/current/sql-createfunction.html).
The dedicated owner's future functions also lose the global PUBLIC EXECUTE
default; a schema-only revoke would not remove it. See
[default privilege rules](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

The existing AOC Admin/support, Next.js and Python credentials were not queried
or changed. Existing legacy tables have no new RLS from this migration. Do not
claim that today's running portal or its global Admin/source paths are now
agency-isolated. Approved support grants/audit lifecycle remain later work.

## Pooled connection scope

[withAgencyScope](../../lib/agency-scope.js) validates string bigint IDs, checks out
one connection, checks the role and clean starting state, starts transaction-local
settings, validates the complete scope, runs trusted parameterized work, and
commits/rolls back. It checks cleared context and discards a tainted or failed
connection. A retained query facade is invalid after the callback returns.

The Next-only wrapper imports the existing `lib/database.js` pool. It creates no
feature pool. Standalone migration/check scripts use short-lived standard `pg`
connections; the fixture's two separate max-one-connection pools are diagnostics,
not new application pools. Python's existing `chatkit_backend/database.py` remains
unchanged and is still the only Python connection path for later integration.

One authenticated database login is bound to one agency. A shared credential for
all agencies is **not supported as a tenant selector**. Future connection routing
must be designed in the central database layer, with separate restricted agency
credentials, before enabling agency routes. Do not swap a live shared pool's URL
per request or impersonate another agency using SET ROLE. Transaction poolers must
preserve the authenticated database user; a proxy that collapses all users to an
owner/service credential cannot be called RLS-protected.

There is no new route or frontend switch. No existing page, API, worker or Python
route imports these helpers. This structural gate remains until Stage 11 and a
separate verified rollout; the foundation alone is not a working agency product.

## Private setup when an approved target becomes available

1. The database owner designates a disposable or approved staging PostgreSQL
   target. Keep the URL/password private in a separate ignored `.env.agency-test`
   or the test process's environment. Do not copy either checkout's `.env.local`.
2. For an approved migration target with existing core/client-access schema,
   privately set `AGENCY_MIGRATION_DATABASE_URL` to the authorized setup/migration
   login. Have the database owner review and run the versioned
   [000_role_setup.sql](../../database/agency-platform/000_role_setup.sql).
   It requires role creation, ability to grant database CREATE, and limited legacy
   column REFERENCES/SELECT grants to the owner role. It creates no LOGIN/password.
   The operator's owner membership must never be granted to the runtime login.
3. The owner creates restricted LOGIN credentials privately and grants only
   `aoc_agency_runtime`, with no privileged inheritance, public schema CREATE or
   legacy table permissions. On older database defaults, the owner must separately
   review/revoke public schema CREATE from PUBLIC before runtime use. Register
   each login/agency mapping through the trusted owner. No production roles are
   created or modified by this stage.
4. `AGENCY_TEST_DATABASE_URL` is a separate authorized owner/CREATEROLE connection
   for the acceptance fixture. It must address an **empty dedicated disposable
   database**, with no existing agency schema/group-role names. The fixture
   creates real core tables, the two group roles and two random LOGIN roles.
   These are cluster-level role operations; use an isolated PostgreSQL instance
   or appropriately isolated provider branch, not a production/shared-role test.
5. The commands below require the exact database-name acknowledgement. The
   acknowledgement prevents accidental fallback; it is not proof that a target
   is safe. The owner must approve it first. No provider sign-in/consent is needed
   for code preparation; ask for a named account action only for a later live check.

Both URL names are now configured privately in this worktree's ignored
`.env.agency-test`, pointing only to the new loopback server. Windows ACLs allow
the owning Windows account, the sandbox account and SYSTEM; inheritance is off.
`.env.example` still contains empty placeholders only. No values were printed,
copied from Neon or put in these documents. A temporary bootstrap password file
was removed after initialization.
Current root Drive/cron and reviewed-feature setup gaps remain historical handoff
items, not prerequisites to this offline migration review.

Safe offline plan and tests:

```powershell
npm run agency:plan
npm run test:agency
npm run test:agency:database
```

The database command reports SKIPPED without its dedicated target; it does not
load `.env.local` or use `DATABASE_URL`. After private setup and explicit approval,
the owner may run the following from the isolated worktree (substitute only the
approved database name, never paste a URL/password into the command):

```powershell
node --env-file=.env.agency-test scripts/migrate-agency-platform.mjs --apply --confirm-database <approved-staging-database-name>
node --env-file=.env.agency-test scripts/check-agency-platform-database.mjs --confirm-database <empty-disposable-database-name> --allow-role-fixtures
```

The fixture requires an empty target in a fresh cluster-role environment. It
seeds Harbor Agency/Orchid and Summit Agency/Pine plus unassigned Birch;
broad synthetic legacy memberships must not bypass the new constraints. It tests
owner/member mismatches, null ownership/common approval, A1 allow/A2-B1 deny,
foreign DML, private/common source metadata, forged scope, membership revocation,
owner exception, role attributes, FORCE flags and scope cleanup after commit and
rollback on reused connections. It cleans up only the fixture-created schema,
tables and roles. The successful local run independently verified that cleanup
before provisioning the separate migration database.

Group roles are cluster-wide. This run executed the empty acceptance fixture
**before** the separate migration application, so the shared role names were
unused for the fixture. The retained migration database now uses those roles;
rerunning the fixture requires a fresh isolated cluster/role environment, not
merely another empty database. Keep the preflight refusal intact.

## Actual results and stop gate

Docker was unavailable. Ubuntu WSL was available, so official Ubuntu PostgreSQL
18.3 packages and required libraries were downloaded and extracted into a private
task directory without sudo, system package installation or service registration.
The cluster listened only on loopback with SCRAM password authentication. Two
new databases separated acceptance fixtures from the standalone migration check.

| Actual check | Result |
| --- | --- |
| Prerequisite core/client-access schema and versioned role setup | Pass on local synthetic/empty data only. |
| Real acceptance fixture | **9 scenario groups passed**: version/rerun; ownership/member mismatch; explicit resource/common approval; scoped reads; foreign DML; forged settings and same-backend reuse; polluted-backend replacement; membership revocation; FORCE/owner/privileged-runtime checks. |
| Standalone migration CLI | Pass on first application and identical repeat; actual target identity/name verified before writes. |
| Independent migration metadata | One checksum version; eight ENABLE/FORCE-RLS tables; expected safe NOLOGIN group flags; zero legacy clients/users/memberships after application. |
| Independent acceptance cleanup | Pass: no fixture tables/schema, generated LOGIN roles or fixture group roles remained before migration provisioning. |
| Offline safety suite / focused lint | **9 tests passed, 0 failed**; lint passed. These complement the real SQL checks. |
| Server lifecycle | Stopped cleanly after verification; task-specific data/binaries and ignored local configuration retained for review. |

The first real run exposed cleanup error **2BP01**: the dedicated owner still had
USAGE on the `public` schema. The fixture now revokes that task-created grant
before dropping the group roles. The corrected fixture passed, and explicit
backend-PID assertions plus session-pollution replacement were added and passed.
No migration SQL or runtime authorization policy needed to be weakened or changed.

Machine-local evidence and the rootless WSL helper are under the original
checkout's `.tmp/agency-stage03-local/`. `local-postgres.json` identifies the
disposable directory and port without storing a password. Its helper's `serve`
mode runs the retained cluster in the foreground; `stop` shuts down only that
cluster. Credentials remain solely in the private `.env.agency-test`.

Production/Neon role configuration, external transaction poolers, deployment,
legacy-table adoption and live application/provider behavior remain unverified.
No broader build or unrelated Hubstaff/credit/Website Insights SQL suite was
rerun. The verified scope is this additive foundation on local PostgreSQL; owner
credentials remain a trusted exception, and no agency interface is exposed.

**Stage 03 local acceptance is complete. Stop before Stage 04.** New routes remain
deferred until Stage 11 and a separately authorized, verified rollout.
