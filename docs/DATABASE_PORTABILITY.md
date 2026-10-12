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
7. Run every migration and `npm run setup:check -- --employee`, then test staff,
   client, and employee login; conversations; uploads/downloads; library files;
   provider settings; Hubstaff token refresh; and usage accounting.
8. Compare critical row counts and sequences, switch writes once, and retain a
   tested rollback window. Never allow both databases to accept production writes
   after cutover.

Current Supabase references:

- [Connect to PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Migrate an existing PostgreSQL database](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres)
