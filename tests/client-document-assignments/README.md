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
- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID`, `CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET`,
  `CLIENT_DOCUMENTS_ENCRYPTION_KEY`, `CLIENT_DOCUMENTS_ALLOWED_EMAIL`: generated
  fictional test-only configuration for deterministic Google transport tests.
  No real Google token/account is required or contacted by those tests.
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

Eleven browser checks run in order on one worker as a save/edit/revoke workflow.
They use real username sign-in and database persistence, and block external
browser requests. Drive-looking IDs are metadata validation inputs only; no fake
Google API or consent is substituted. Stop the test server and destroy the
disposable database/accounts and private fixture file afterward.

General regression commands remain `npm test` and `npm run test:internal-user`.
The completed rehearsal also ran the offline source/Hubstaff suites, changed-file
lint and production build. Actual results are in `docs/CLIENT_DOCUMENTS_PROGRESS.md`.

## Delivery and Google adapter checks

After the initial database suite writes its private fixture, run these in separate
Node processes with the same isolated configuration:

```powershell
node --test tests/document-delivery-policy.test.mjs
node --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test tests/client-document-assignments/delivery.database.test.mjs
node --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test tests/client-document-assignments/google.database.test.mjs
```

The delivery suite mocks the Google adapter only, using real SQL/auth/API checks.
The Google suite exercises the actual adapter and OAuth state SQL while mocking
Google OAuth token/identity and HTTP methods. It checks wrong-account/scope/config,
state replay/expiry/session substitution, disconnect/reconnect races (including an
initial grant with no prior connection), admin revocation during exchange, encrypted
credential copying, foreign file ancestry and bounded content. These are fixtures,
not evidence of live provider consent or downloads. They clean local connections
before the browser run. The browser run uses real portal auth/SQL, verifies admin
journey changes and client isolation, and never simulates a connected Google UI.
Live Google review/publication/download remains a separately authorized pilot.

## Five-step presentation and filtering

`node --test tests/client-journey.test.mjs` checks all seven→five mappings, grouped
step completion, unknown status, filter validation and literal wildcard handling.
The delivery database suite adds 53 temporary release metadata rows to verify
search/type/client-step combinations beyond the first page and foreign-client
isolation. Those are metadata fixtures, not approved real Google files. The
browser suite also checks the five-step client view, seven-stage admin table,
mobile filtering/reset, dashboard next-action card and unrelated-client fallback.
Search filters apply on the server before paging; no data/schema migration or
new private setup variable is needed for this update.


## Approved link-library verification (no Google configuration)

Run `links.database.test.mjs` after `database.test.mjs` on the same guarded fresh
loopback fixture, in a separate Node process with the existing aliases/conditions.
Leave all four CLIENT_DOCUMENTS_GOOGLE_* / CLIENT_DOCUMENTS_ENCRYPTION_KEY /
CLIENT_DOCUMENTS_ALLOWED_EMAIL settings empty for this suite. It uses real Better
Auth, ordinary runtime SQL and API handlers; Google is not contacted. It verifies
private saves, explicit approval, copied links, client switching, revocation,
publisher status, Viewer reads, filters/pagination and publication history. Its
workspace membership changes are cleaned before the older provider fixture suites.
Advanced Google suites still use their separately generated fictional configuration.

`tests/admin-readiness/browser/document-links.spec.mjs` checks the real admin and
client components with mocked APIs; `documents.spec.mjs` retains focus/draft/race
regressions. Run both using the existing admin-readiness Playwright configuration.
These browser component fixtures do not claim real Google sharing verification.


## Server-rendered library regression

Run server-rendered-library.spec.mjs with this directory's existing Playwright
configuration and fresh guarded loopback fixture. It requires matching
CLIENT_DOCUMENTS_FIXTURE, CLIENT_DOCUMENTS_TEST_DATABASE_URL, DATABASE_URL and
BETTER_AUTH_URL (use a private ignored test config, never the live .env.local).
Start the full app with the fixture's ordinary runtime role on its fixture origin.
The test validates the local target, creates one fictional approved link through
the real API, and archives it afterward. No Google/file/provider request is sent.
It covers actual server HTML with JavaScript disabled, blocked browser list API,
reload, unrelated-client denial and membership revocation for an existing session.
Do not run this suite on a remote database or real accounts.

document-loading.spec.mjs in admin-readiness separately uses mocked component
API responses for deadlines, retry, foreign initial props and visibility checks.
Server-rendered markup can appear before hydration; simulated visibility events
must wait until an interactive handler has demonstrably run.


## Private object Storage checks

Run `node --conditions=react-server --test tests/client-document-storage/*.test.mjs`
for deterministic provider/TUS tests with synthetic keys and mocked fetch.
`tests/admin-readiness/browser/document-storage.spec.mjs` adds actual Chrome
desktop/mobile interactions while intercepting Storage/API responses. Existing
bulk, link, upload, loading and focus tests remain applicable.

`storage.database.test.mjs` requires the same guarded loopback-only Better Auth
fixture as the other database suites; run after assignments/links/legacy files.
Apply 004 metadata and the Storage policy twice with an operator and ordinary app
role, never loading the live .env.local into the test. The disposable database's
synthetic `storage.objects(bucket_id text)` table enables RLS and deliberately has
a permissive PUBLIC policy, SELECT/INSERT grants to anon/authenticated and two
rows (private-fixture, other-bucket). Grant the disposable operator SET ROLE on
those two NOLOGIN test roles, then apply the reviewed restrictive policy for
private-fixture. This is a policy stand-in, not Supabase's real Storage schema.
Real ordinary runtime authorization is checked separately. Provider responses
remain mocked and assertions reject every non-fixture provider origin.
The test rejects non-loopback/non-disposable database names and checks the
runtime's host/database match while requiring a separate non-super/non-BYPASS login.


## Selected upload retry and bulk-delete UI coverage

Run document-bulk.spec.mjs and document-bulk-delete.spec.mjs with the existing
tests/admin-readiness/playwright.config.mjs, with private runtime env settings
cleared. They test checked/per-row retries, no repeated saved uploads, stable retry
keys, confirmation cancellation, mixed link/BYTEA/Storage deletion, failed-row
selection, search filtering, access revocation (JSON and HTML), and client switching.
These are real Chrome interactions with intercepted synthetic APIs, not live deletes.
Run the existing simple/link/loading/storage/document fixtures for affected UI
regressions. Server authorization and archive audit continue through existing routes;
no new bulk API or database migration was introduced.


## Image and PDF preview checks

`node --test tests/document-preview-policy.test.mjs` checks safe MIME/address
selection, byte-range validation and inline filename encoding. Provider tests
under tests/client-document-storage cover full/partial streams and rejected
provider ranges. The disposable storage.database.test.mjs suite adds real runtime
checks for preview bytes, foreign clients, stale revisions, invalid ranges,
membership/publisher revocation during a read, unsharing and unsupported source
preview types. Provider responses in that database suite remain mocked.

Run document-preview.spec.mjs with tests/admin-readiness/playwright.config.mjs for
desktop and touch Chrome: lazy image loading, collapse/client switch, actual native
PDF viewer load success, safe download fallback, failed image retry and revoked PDF
preflight denial. It uses generated PNG/PDF fixtures and intercepted APIs. Chrome's
headless PDF surface is not reliably captured in screenshots; the native viewer's
load state is asserted instead. Real mobile Safari/Firefox and deployed CDN behavior
are not established by these tests.


## Permanent byte deletion and reconciliation

Apply documents:storage:lifecycle:migrate twice after Storage version 004 on the
same guarded disposable DB. The fixtures verify original-name paths, actual
provider removal, retryable physical deletion, grant-window rechecks, cleanup
role grants, copied-but-uncommitted rename recovery, mismatched destination
hash rejection, retained IDs/audit, active/foreign path protection, expired
pending uploads, concurrent ordinary-role workers and scheduler secret checks.
Provider fetch remains mocked; no test writes customer objects. Legacy archived
BYTEA content is asserted empty, with audit rows retained. The cron auth checks
use a test-only server secret, not an account password.

Run document-cleanup.spec.mjs with the normal admin-readiness browser config for
desktop/touch pending-cleanup retry, failure feedback and client-switch scoping.
Normal single/bulk uploads, delete, link, focus/loading and preview suites still
apply. Production scheduling/CDN and live portal-authenticated UI are separate
checks; an object-adapter fixture is not evidence of a live portal login.


## Client half-resolution previews

`node --test tests/document-image-preview.test.mjs` uses generated real raster
bytes and sharp to test half dimensions, EXIF orientation, transparency, maximum
dimensions, original preservation, metadata stripping and rejected active/malformed
content. No provider call is made. The real disposable files/storage database
suites exercise thumbnail delivery through current client routes and auth roles,
including revocation after provider reads. Image bytes there are generated fixtures;
provider responses remain mocked. Run client-document-preview.spec.mjs alongside
document-preview.spec.mjs and document-loading.spec.mjs using the normal browser
config to cover preview-first image cards, original download, deferred PDF viewing,
fallback, revocation and switching. It uses actual components and generated image/
PDF responses, not real customer documents or live account credentials.
