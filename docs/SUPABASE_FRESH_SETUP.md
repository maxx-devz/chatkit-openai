# Fresh local Supabase setup

Completed on 2026-11-20 in `C:\Users\MY PC\Desktop\AI\portal`, branch
`client-documents` (application baseline `2e10e4a`). The user explicitly chose a
fresh database instead of migrating the development data from Neon.

## What changed

- Initialized the verified empty `public` schema in the selected Supabase project.
  Better Auth's installed migration API and all 23 existing portal SQL schema
  files were applied, including both checksummed Client Documents migrations.
- Added `database/portal-runtime-grants.sql` to make the runtime grants reviewable
  and repeatable. It uses standard PostgreSQL and only revokes the optional
  `anon`/`authenticated` roles when those roles exist. It does not change managed
  Supabase `auth`, `storage`, or other service schemas.
- Created a separate `aoc_portal_runtime` database login with a generated private
  password, no elevated role privileges and no application-table ownership.
  It has the existing server application's data privileges. Document audit tables
  remain append-only for that login; it cannot edit the document migration ledger.
- Updated only `DATABASE_URL`, `DATABASE_POOL_MAX` (to `1`) and
  `SUPABASE_MIGRATION_DATABASE_URL` in the local `.env.local`. All other settings
  and surrounding comments were preserved. No environment values appear here.
- Created one new AOC administrator through the existing Better Auth provisioning
  command. There are no client accounts, old conversations or imported provider
  settings. Existing environment-based provider fallbacks were left unchanged.
- Restarted only the identified Next.js/Python processes belonging to this
  checkout. Local review workers for Drive and Hubstaff synchronization were
  disabled for this launch; the saved worker settings were not altered.

Neon was not deleted, reset, updated or imported. No Vercel settings were changed,
no deployment or push was performed, and no Google consent or AI call was made.

## Private local files and review

The Git-ignored folder `.tmp/supabase-fresh-local/` is restricted to the current
Windows user and SYSTEM. Do not commit or share it.

- `accounts.json`: use `admin.username` and `admin.password` for the new login.
- `environment-before.env`: exact local environment backup from before the switch.
- `prod-ca-2021.crt`: the downloaded Supabase CA used by both runtimes.
- `private-state.json`: generated setup credentials; keep private.
- `setup-result.json`, `verification-result.json`, `browser-result.json`: local
  result records. Server/provision logs and browser screenshots also stay private.

Review at `http://127.0.0.1:3000/login`, then `http://127.0.0.1:3000/admin`.
The document setup screen is `/admin/client-documents`. Create actual development
clients through AOC Admin when ready; the fresh database deliberately has none.
Old Neon passwords and memberships do not sign in to this fresh database.

## Connections, certificate and permissions

The local server and operator URLs use the approved session-pooler endpoint with
`sslmode=verify-full` and `sslrootcert` pointing at the private local certificate.
Spaces in the certificate path must be percent-encoded as `%20`, not `+`:
Node's URL form encoding and PostgreSQL/libpq URI decoding differ here.
No `rejectUnauthorized:false`, `sslmode=disable`, Supabase browser SDK, Supabase
Auth migration or Supabase Storage migration was introduced.

TLS certificate and hostname verification passed for the client-to-pooler hop.
The backend-side `pg_stat_ssl` observation was `false` through the pooler; this
setup does not claim that observation proves end-to-end or upstream TLS.

This branch uses application authorization for client and user isolation. The
shared server role can access application rows across clients; no tenant RLS
policies were added or claimed. The 66 application tables have RLS disabled.
The runtime is not a superuser, has no BYPASSRLS/CREATEDB/CREATEROLE privileges,
cannot create objects in `public`, and owns no application tables. The public
Supabase API roles have no SELECT access to application tables. The Data API
dashboard toggle itself was not inspected through an authenticated management API.

Use `SUPABASE_MIGRATION_DATABASE_URL` only for deliberate operator migrations.
Ordinary `npm run ...:migrate` commands otherwise pick up the restricted runtime
`DATABASE_URL` and may correctly fail DDL authorization. For example, with Node
22+, this temporary process-only override uses the existing portal migrator:

```powershell
node --env-file=.env.local --input-type=module -e "process.env.DATABASE_URL=process.env.SUPABASE_MIGRATION_DATABASE_URL; await import('./scripts/migrate-portal.mjs')"
```

Apply `database/portal-runtime-grants.sql` through a short-lived operator `pg`
client after adding new application tables. It is repeatable and never grants
access to browser roles. Keep provisioning scripts on `lib/postgres.js`, Next.js
on `lib/database.js`, and Python on `chatkit_backend/database.py`.

## Verification results

- Supabase PostgreSQL 17.12: real Node connection, certificate and hostname check
  passed; actual Python `connect_database()` passed with prepared statements off.
- Better Auth migration plus 23 existing SQL files passed; total 66 application
  tables, zero client records and zero previous conversations.
- Runtime-grants migration passed twice without duplicate objects; owner/bypass
  checks, document audit restrictions and public API-role denial passed.
- Existing administrator provisioning, real password login and active `aoc_admin`
  mapping passed. Existing setup checker passed all 30 checks including the
  Internal Portal schema configuration checks.
- Focused offline regression tests: 17 passed, zero failed/skipped (PostgreSQL
  query parameters, client roles, document assignment and delivery policies).
- Real Chrome browser: four checks passed (anonymous API denial, password login
  to AOC Admin, authenticated empty client list, and Documents & Journey empty
  state). Python review `/health` returned HTTP 200. The first browser attempt
  used an incorrect expected heading and timed out; correcting the test locator
  to the existing page heading resolved it without an application change.
- No live AI, Google Drive, Hubstaff or payment test was run. No production build
  or full-repository lint was rerun for this configuration/SQL/documentation-only
  task; JavaScript and React application source did not change.
- Automatic approval review blocked printing server logs because ad hoc redaction
  could expose private information. Page/source checks resolved the browser
  timeout without printing those logs; no verification remains blocked by that
  rejected action.

## Remaining setup and limits

The dedicated document delivery settings remain missing. Set these privately in
this checkout's `.env.local` before connecting the authorized Google account:

- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID`
- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET`
- `CLIENT_DOCUMENTS_ENCRYPTION_KEY` (stable, at least 32 characters)
- `CLIENT_DOCUMENTS_ALLOWED_EMAIL`

Their callback is the exact `BETTER_AUTH_URL` followed by
`/api/admin/client-documents/google/callback`. Shared company-source OAuth is a
separate grant. Existing Google environment settings were preserved, but saved
OAuth connections and source preparation/publication must be configured anew.

No live provider verification was run. Configure any database-managed AI
provider settings, client allowances, credit pricing, project mappings and
approved resources again through the appropriate admin screens. No historical
credit balances, fee versions or indexes were copied or fabricated.

For another computer, privately configure its local environment and certificate
path; neither the ignored account file nor this machine's certificate path is
portable by Git. For Vercel, configure both frontend and Python runtimes with the
intended Supabase runtime URL, pool limit and a deployable CA path or equivalent
verified certificate configuration. This local setup has not changed the hosted
portal. Review that deployment separately before enabling it.

To undo the local switch, stop this checkout's servers, privately restore the
previous environment file, and restart. Neon may still reject connections due to
its quota. This is a configuration rollback, not data reconciliation after writes
have been made in both databases. No database is dropped by that procedure.
