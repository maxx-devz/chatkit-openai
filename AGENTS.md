<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## PostgreSQL portability

The production database is currently PostgreSQL hosted by Neon. The project may
move to Supabase later, so database work must remain portable between standard
PostgreSQL providers.

- Next.js runtime code must use `lib/database.js`. Node provisioning scripts that
  cannot import `server-only` must use `lib/postgres.js`. Migration and diagnostic
  scripts may create a short-lived standard `pg` client and must close it.
- Do not add a provider-specific database SDK, API, SQL extension, or dashboard-
  only schema change without documenting the portability impact and receiving an
  explicit architecture decision.
- Keep schema changes in version-controlled migrations and prefer standard
  PostgreSQL types, constraints, indexes, transactions, and parameterized SQL.
- Keep `DATABASE_URL` and all database credentials server-only. Browser database
  access requires a separate Row Level Security design and is not implied by a
  future Supabase move.
- Better Auth and database-backed file storage remain independent subsystems.
  Moving to Supabase Auth or Supabase Storage would be a separate migration.

Read `docs/DATABASE_PORTABILITY.md` before changing database connections,
schema, authentication persistence, or file storage.
