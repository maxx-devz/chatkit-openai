# Stage 11 runtime database roles

Review baseline: `817c314`. All database checks in this review used a fresh,
disposable loopback PostgreSQL 18.3 cluster. **No Neon connection was made.**

## What the runtimes actually use

| Path | Connection behavior |
| --- | --- |
| Next.js application DAL | `lib/database.js` decorates the canonical `lib/postgres.js` pool with `runtimeDatabasePool`; it does not create another pool |
| Better Auth web requests, including server-side provisioning without Next cookies | `lib/auth.js` selects the same checked pool by default. `useNextCookies:false` does not bypass the guard |
| Python ChatKit and preview requests | `chatkit_backend/database.py:connect_database` opens the configured `DATABASE_URL`, checks the actual database session and returns it only if allowed |
| Explicit operator commands | Standalone provisioning uses `lib/postgres.js`; the auth migration/create-account CLIs explicitly request `operatorDatabase:true`. This is an internal function option, not a request or environment override |

Next.js and Python each read their own process's private `DATABASE_URL`. The local
dev launcher shares its prepared environment with both children. Separate deployed
projects must each be configured and checked. A URL's username alone cannot prove
the database role's attributes or inherited privileges.

The review verified the real Next DAL/Better Auth pool and Python connector with
the ordinary disposable application login. A fresh Node process using the exact
`lib/database.js` entry point also rejected the disposable privileged login.
This does **not** establish which role is currently configured or deployed on
Neon; inspecting that remote target would violate this task's constraint.

## Two distinct boundaries

1. **Intentional shared legacy service access.** The ordinary application login
   can directly read legacy rows across clients. Most legacy tables do not have
   tenant RLS. Authenticated application authorization, explicit client/agency
   predicates and private delivery enforce tenant permissions on those paths.
   Restricted agency LOGINs and the new protected ledgers have separate database
   controls. Do not expose the service credential, an arbitrary SQL endpoint or
   a browser database/Data API. This is not a claim of universal tenant RLS.
2. **Unintended owner/elevated runtime credentials.** Before this review the
   connectors accepted roles that could bypass protected-table policies. The new
   runtime checks reject those credentials for an agency-adopted database.
   This is a configuration guard in the application, not a sandbox against
   malicious trusted server code or an owner connecting through operator tools.

## Guard behavior

The guard reads standard PostgreSQL catalogs. Once the agency `backfill_state`
table is installed, it rejects:

- A changed effective role (`current_user` differs from `session_user`).
- Direct or inherited superuser, `BYPASSRLS`, role/database creation or replication
  capability; membership in the dedicated agency owner or broad data/file/server
  execution roles.
- Database or public/agency schema ownership.
- Ownership of agency relations, portal relations or Better Auth tables.

Node checks on each pool checkout, including a previously used connection. A
denial destroys that borrowed connection before application SQL. Query errors
also discard the connection, matching the normal `pg.Pool.query` contract.
Promise and callback interfaces remain supported. Python checks each new runtime
connection and closes it on denial. No role decision is cached across requests.
Changes to an in-flight connection are not claimed to be instantly interrupted.

Pre-adoption databases retain legacy compatibility; this guard does not silently
turn an existing single-AOC installation into a migrated tenant database. The
operator diagnostic nevertheless fails its readiness check if adoption is absent.
The external agency gate remains closed in either case.

No new migration, database provider SDK, extension or runtime secret is required.
Catalog checks and existing transaction-local Python timeouts remain portable.
Actual hosted transaction-pooler role mapping/reset behavior is a deployment
verification task; this local PostgreSQL test is not a hosted pooler test.

## Role setup for an approved target

Use a dedicated ordinary LOGIN for each runtime, or the same reviewed service
LOGIN in both. It must be NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and
NOREPLICATION, without owner/elevated-role membership. It must not own the
database, relevant schemas or application relations.

An authorized database operator configures passwords privately and grants only
the reviewed legacy DML/sequence privileges and narrow functions described in
the Stage 03/04 runbooks and subsequent migrations' `--app-role` grants. Do not
fix a missing permission by granting owner membership or transferring ownership
to the runtime. Owner credentials belong in the operator shell's
`AGENCY_MIGRATION_DATABASE_URL`, never the web/Python runtime `DATABASE_URL`.

With the approved runtime URL configured privately, run the read-only diagnostic:

```powershell
npm run agency:runtime:check -- --confirm-database <approved-database-name>
```

It prints catalog booleans only, never URL, password or role name. Exit 0 requires
an adopted database and an allowed role. This command does not load `.env.local`
automatically. Do not run it against Neon under this task's authorization.
Check both deployed services separately when a named staging check is approved.

For local tests, use the existing private `AGENCY_WORKSPACE_TEST_DATABASE_URL`
and distinct runtime `DATABASE_URL` for the same disposable fixture. The new
`tests/agency-backfill/runtime.database.test.mjs` requires loopback and the
documented disposable database-name pattern. It invokes the actual Python
connector and the diagnostic with synthetic credentials. Its test-only
`STAGE11_EXPECT_RUNTIME_SAFE` assertion setting is not an application bypass.

## Actual verification

The real database matrix passed five scenario groups (six TAP tests including
the parent): actual DAL/Auth/Python safe-role identity; owner rejection in both
connectors; discarded pooled `SET ROLE`; inherited owner membership; and
`BYPASSRLS`/portal relation ownership. The unsafe membership fixture first proved
raw RLS-protected reads were possible, then proved the runtime refused that login.
Revoking the unsafe membership allowed a fresh ordinary checkout again.

Existing Internal SQL/SQLite unit fixtures explicitly mock the runtime guard;
they are not database-role proof. The real database fixture above supplies that
proof. Operator connections inside Python database fixtures are now explicit
raw `PortalConnection` setup connections, separate from tested runtime connections.

See [ISOLATION-EVIDENCE](ISOLATION-EVIDENCE.md) for the current classification,
BFCache result, remaining external-release blockers and Stage 11 verdict.
