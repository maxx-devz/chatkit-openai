# PostgreSQL portability and a possible Supabase migration

The portal currently runs on PostgreSQL hosted by Neon. Supabase is a possible
future host, but no Supabase account, SDK, Auth integration, or Storage integration
is required now. Both hosts provide PostgreSQL, so the application deliberately
uses provider-neutral database connections and SQL.

## Rules for new code

- Next.js server code imports the shared pool or SQL tag from `lib/database.js`.
- Node provisioning scripts that run outside Next.js import from
  `lib/postgres.js`. Migration and diagnostic scripts may create a short-lived
  standard `pg` client and must close it. Do not create another application pool
  in a feature module.
- Python code connects through `chatkit_backend/database.py`.
- Use parameterized queries and standard PostgreSQL features. Before adding an
  extension or provider-specific feature, verify that both the current database
  and Supabase support it and record the decision here.
- Every schema change must be reproducible from a committed migration. Do not
  create application tables or columns only through a provider dashboard.
- Keep `DATABASE_URL` server-only. The browser must continue to use authenticated
  application routes; introducing Supabase's browser Data API would first require
  a complete Row Level Security policy and authorization review.
- Continue treating Better Auth and file storage as separate concerns. A database
  move does not require moving to Supabase Auth or Supabase Storage.

The shared Node pool is controlled by `DATABASE_POOL_MAX` and defaults to `3`.
The setting is capped at `10` to avoid multiplying connections across serverless
instances. The Python connection disables automatic prepared statements so it is
compatible with transaction-mode poolers.

## Current portable data

AI Credits reporting uses `database/ai-credits-schema.sql`: standard PostgreSQL
NUMERIC, BIGSERIAL, UUID retry keys, transactions and row locks. It reuses the
existing cost ledger and never changes provider rates, request limits, payments
or prepaid billing. Runtime routes use `lib/database.js`; migrations and TEMP
fixtures use short-lived standard pg clients. No provider SDK/extension is added.

Admin adjustment reasons add one nullable standard TEXT column to the same
versioned credits migration. Old entries are preserved. Read-only admin reports
use the shared database module and PostgreSQL catalog checks; they do not run
DDL or create reporting fee/usage entries on a read. The migration remains an
explicit environment step; local UI tests do not apply it to shared data.

Client Website Insights uses four additive tables from
`database/website-insights.sql`: websites, report jobs/history, encrypted Google
connections and expiring OAuth states. They use standard PostgreSQL UUID, JSONB,
foreign keys, timestamps and partial indexes. Runtime access uses `lib/database.js`;
the migration and TEMP-fixture database tests use short-lived `pg` clients. No
provider SDK, extension, auth migration or existing admin/internal-table change
is required. Run `npm run website-insights:migrate` against the portal database.

AI generation options use an additive standard JSONB column on
`portal_site_ai_settings`, defined in `chatkit_backend/site_ai_schema.sql` and
applied with `npm run site-ai:migrate`. No provider SDK or extension is involved;
the migration preserves saved provider keys/models and is safe to rerun.

Shared company knowledge reuses `portal_source_publications` and the encrypted
prepared-source tables. `database/prepared-source-schema.sql` upgrades the ordinary
CHECK constraint and adds a partial UNIQUE index for the `clients` audience. No
publication is enabled by migration, and no provider-specific extension is required.

Client AI spending uses `portal_ai_cost_events` and `portal_ai_cost_state` from
`database/ai-cost-schema.sql`: ordinary PostgreSQL decimal `NUMERIC(24,12)`, JSONB
pricing snapshots, UUIDs, timestamps and portable indexes. It requires no external
billing SDK or database extension and is independent of request-allowance resets.

Portal data uses ordinary PostgreSQL tables, foreign keys, indexes, `BIGSERIAL`,
`JSONB`, `UUID`, and bounded `BYTEA` values. These can be transferred with normal
PostgreSQL dump/restore or logical-replication tools. Existing Better Auth tables,
password hashes, conversations, settings, usage data, and stored file bytes move
with the database when Better Auth remains the authentication system.

Supabase Auth uses a different account system, and Supabase Storage uses separate
objects and metadata. Adopt either only through a dedicated migration with its own
rollback and authorization plan.

## Future migration checklist

1. Inventory the source PostgreSQL version, extensions, database size, roles,
   sequences, row counts, and file-byte volume.
2. Create a Supabase project in the appropriate region and test a full dump and
   restore before scheduling production work.
3. Use Supabase's direct or session connection for dump/restore and migration
   tools. Use its transaction-pooler connection for the Vercel/Next.js and Python
   serverless runtimes, with TLS required.
4. Start with `DATABASE_POOL_MAX=1` for Supabase serverless deployments, then raise
   it only if measured concurrency requires it and the project's connection budget
   permits it.
5. Set the same new `DATABASE_URL` on both deployed services. Do not place it in a
   `NEXT_PUBLIC_*` variable.
6. Recreate any required database roles and review Row Level Security explicitly;
   do not assume role or RLS state was transferred.
7. Run every migration and `npm run setup:check -- --internal-user`, then test staff,
   client, and internal user login; conversations; uploads/downloads; library files;
   provider settings; Hubstaff token refresh; and usage accounting.
8. Compare critical row counts and sequences, switch writes once, and retain a
   tested rollback window. Never allow both databases to accept production writes
   after cutover.

Client Hubstaff search (`database/hubstaff-search-schema.sql`) uses standard
PostgreSQL generated `tsvector` columns, GIN/B-tree indexes and parameterized SQL.
It requires no vector extension or provider-specific service. Runtime access uses
`lib/database.js`; the CLI migration uses a short-lived `pg` client. Rebuild these
derived indexes after a database move if they were not included in the migration.

Unattended Hubstaff scheduling adds nullable attempt/success/retry timestamps and
a bounded integer failure counter to the same index table using rerunnable
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements in that migration.
No scheduler-specific service, SDK or PostgreSQL extension is required.

Per-client indexing controls reuse that migration and add a nullable `queued_at`
timestamp, two standard BIGINT processed-count columns and a counted-at timestamp
on the same table. Older workers' batch timestamps do not become fabricated zero
processed counts; the counted-at marker must match the completed batch.
Queue requests use a transaction and the current server-owned client mapping;
there are no provider-specific queue services or database extensions.

Current Supabase references:

- [Connect to PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Migrate an existing PostgreSQL database](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres)

An authorized AI usage reset now establishes a per-client reporting cutoff.
`database/ai-usage-controls.sql` (also included in fresh AI cost setup) creates
`portal_ai_usage_resets` using standard PostgreSQL timestamps, UUIDs, keys and
parameterized UPSERTs. Credit and cost reads exclude pre-cutoff usage, retaining
manual allowances, pricing and raw audit evidence. No provider-specific
extension, browser database access or external billing mutation is introduced.

## Client Documents setup references

`database/client-document-assignments.sql` adds separate client-bound setup and
audit tables. The migration runner uses a short-lived `pg.Client`, an explicit
operator URL, database-name confirmation, a checksum and a transaction/advisory
lock. Runtime routes use `lib/database.js`. UUID, JSONB, identity, partial unique
indexes and composite foreign keys are standard PostgreSQL features; no provider
SDK, extension, Auth change or storage migration is introduced.

The ordinary runtime receives append-only audit grants from this migration.
Existing elevated logins or broader privileges can override that restriction;
this feature does not claim database RLS. Current AOC Admin request authorization
is the access boundary. Original Drive files are neither uploaded nor published
by saving metadata. Existing clients/history/credit/index tables are not backfilled
or rewritten. See `CLIENT_DOCUMENTS_SETUP.md` for explicit migration approval and
private setup requirements.

Document delivery adds migration `002_delivery` in
`database/client-document-delivery.sql`: separate encrypted OAuth connections and
one-time states, version-bound releases, client journey state, and append-only
publication/milestone/connection audit. The original `001_assignments` checksum and
tables remain unchanged. Ordinary runtime privileges and standard PostgreSQL
constraints/transactions are used; no provider SDK/extension or RLS claim is added.
Original Drive files stay in Drive and are read on demand, with no file-storage
migration or AI-source publication.

## Fresh local Supabase development setup

On 2026-11-20 the user chose a fresh Supabase development database for the
`client-documents` checkout instead of importing Neon records. Neon and hosted
Vercel configuration were left intact. See [fresh setup and verification](SUPABASE_FRESH_SETUP.md).

`database/portal-runtime-grants.sql` records standard PostgreSQL access grants for
the separately provisioned, non-owner `aoc_portal_runtime` login. Optional
Supabase API-role grants are revoked only when those roles exist. No provider SDK,
SQL extension, Supabase Auth/Storage switch or tenant RLS claim is introduced.
Use the private operator URL for future DDL, then reapply the runtime grants.


Client plans use the versioned `database/client-plans.sql` migration and a shared
standard PostgreSQL balance view. Runtime access remains server-only through the
existing Node/Python connectors. A separate operator connection applies reviewed
DDL/grants; no new provider SDK, browser grant or tenant-RLS claim is introduced.
Legacy reporting entries remain immutable history rather than subscription debits.
See `docs/CLIENT_PLANS.md` for paid activation, per-request locking and limits.


Approved document links (2026-11-23) reuse the existing assignment revision and
append-only assignment audit result JSONB. Publication and its new revision commit
atomically; current-client/revision checks withdraw older receipts after an edit,
removal or unpublish. No new schema, provider SDK, applied migration modification,
Google connection or DDL-on-read is introduced. PostgreSQL transactions, joins and
parameterized JSONB predicates work with the existing portable database helper.


Client-facing document descriptions reuse revision-scoped result JSONB in the
existing assignment audit table. Server validation limits plain text to 1,000
characters. Description reads match the current client/assignment revision; saves
and publication/unpublication receipts preserve them atomically. Omitted metadata
in legacy requests retains existing values. This adds no DDL and removes no stored
journey data; only the document UI's journey presentation is retired by user request.
