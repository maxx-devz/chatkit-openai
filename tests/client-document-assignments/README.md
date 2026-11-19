# Document setup verification

Run only against a new disposable loopback PostgreSQL database named
`aoc_documents_` followed by ten lowercase hexadecimal characters. Both the fixture
and tests reject other database names/hosts. Use generated test secrets privately;
never point these tests at a shared/staging/production database or normal Neon URL.
These are automated tests, not a mock Google provider or retained review login.

## Prerequisites

- Node 22+, installed dependencies and Chrome for Playwright.
- A fresh local PostgreSQL database with an operator login and a separate ordinary
  application login. The completed rehearsal used disposable WSL PostgreSQL 18.
- Prerequisite migrations: `database/schema.sql`, `admin-schema.sql`,
  `client-access-schema.sql` and `internal-user-schema.sql`, plus Better Auth's
  supported migration through `scripts/migrate-auth.mjs`. Apply only on the new
  local database. Grant the application login the normal auth DML and portal-table
  access before applying the new feature migration. Do not grant blanket future
  table UPDATE privileges that override the intended append-only audit grant.
- Apply `scripts/migrate-client-document-assignments.mjs` twice with the operator
  URL, confirmed database name and application role; compare preexisting table
  contents to verify preservation.

Set these names privately in an ignored test configuration:

- `CLIENT_DOCUMENTS_TEST_DATABASE_URL`: disposable operator URL.
- `CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL`: same disposable operator, migration only.
- `DATABASE_URL`: ordinary runtime login, same disposable database/host/port.
- `BETTER_AUTH_URL`: `http://127.0.0.1:YOUR_TEST_PORT`.
- `BETTER_AUTH_SECRET`: freshly generated test secret.
- `CLIENT_DOCUMENTS_FIXTURE`: absolute path below the ignored `.tmp` directory.

Before starting Next, isolate the child environment and shadow every variable
assigned by local `.env*` files so Next cannot load real provider/Neon credentials.
Use only the above local test settings; disable local source/index workers and
point optional provider URLs at unreachable loopback addresses. Do not run the
normal `npm run dev` wrapper with private production configuration for this test.

## Commands

With that isolated test environment already selected:

```powershell
node --test tests/client-document-assignment-policy.test.mjs
node --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test tests/client-document-assignments/database.test.mjs
```

The database suite signs up and signs in four random temporary test identities
through actual Better Auth server APIs. It writes their credentials to the private
ignored fixture file for the browser suite. No passwords belong in test source.
The test skips if its explicit database variable is absent; a skip is not a pass.

Build and start the actual project with Next on the configured loopback test port
using the isolated runtime environment, then run:

```powershell
node node_modules/@playwright/test/cli.js test --config tests/client-document-assignments/playwright.config.mjs
```

Seven browser checks run in order on one worker as a save/edit/revoke workflow.
They use real username sign-in and database persistence, and block external
browser requests. Drive-looking IDs are metadata validation inputs only; no fake
Google API or consent is substituted. Stop the test server and destroy the
disposable database/accounts and private fixture file afterward.

General regression commands remain `npm test` and `npm run test:internal-user`.
The completed rehearsal also ran the offline source/Hubstaff suites, changed-file
lint and production build. Actual results are in `docs/CLIENT_DOCUMENTS_PROGRESS.md`.
