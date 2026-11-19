# Stage 12 — local AOC platform console

Implementation base: `0064754`, branch `feat/agency-platform`, primary checkout
`C:\Users\MY PC\Desktop\AI\portal`. Local engineering only; external agency
routes and non-AOC client entry remain gated. Nothing authorizes a production
migration, real owner assignment, invitation, deployment or push.

## Routes and permission contract

| Surface | Required authority | Result |
| --- | --- | --- |
| `/platform`, GET `/api/platform/agencies` | Explicit active platform `owner` or `operator`, real unexpired Better Auth session, trusted host, non-Internal identity | Bounded agency metadata, ownership, search, status, current UTC-month recorded provider cost totals, recorded failed jobs/disconnected bindings, recent platform audit |
| POST `/api/platform/agencies` | Platform `owner`; matching origin; strict input; fresh database role/session check | Create agency, suspend or reactivate with reason, operation UUID and audit |
| `/admin/aoc`, GET/PATCH `/api/admin/aoc-clients` | Existing active legacy AOC Admin **and** explicit active AOC `agency_admin` assignment | AOC-owned client list and audited portal/AI access toggles, including in a mixed estate; foreign clients are excluded and cannot be updated |
| Existing `/admin` and legacy Admin APIs | Existing policy unchanged | Global legacy screens still require an all-AOC client estate; no broad mixed-agency bypass was added |
| `/support/requests`, GET/POST `/api/support/requests` | Authenticated non-Internal account; request-specific SQL permissions | Requester sees its requests; AOC agency/client administrators see their permitted approvals. Other accounts receive no request metadata |

An agency's assigned owner is accountability metadata, **not** automatic platform,
agency staff or client access. Agency creation copies no memberships, credentials,
provider resources, knowledge, client records or software subscription. Existing
AOC guidance remains owned by AOC. `owner` can provision/manage; `operator` is
read-only for agencies and can request narrowly approved support. Legacy Admin,
agency staff, client roles and request fields cannot grant platform ownership.

The console reuses the Admin shell, sidebar, branding and draft provider. Default
Admin navigation/behavior is preserved. A platform account without a client
membership may see “Portal access needs attention” after login at `/`; open
`/platform` directly. This is intentional separation, not an automatic promotion.

## Lifecycle and support

Creation requires a real existing portal account identifier, name, unique slug
and reason. This stage creates no default password or external invitation.
Suspension/reactivation requires the current state version, reason and exact slug
confirmation. A repeated identical operation UUID returns its original result;
changed or stale requests conflict. Atomic audit records retain the actual actor.

Suspension sets the existing `is_active` flag, increments `state_version`, cancels
active agency job tokens/leases, advances connection generations and revokes
pending/approved support access. Existing records and assignments are retained.
Client authorization and job execution recheck active state. Reactivation allows
still-active assignments to pass fresh checks; old job leases, callback snapshots
and support grants are not restored. A user's unrelated agency memberships and
global login session are not deleted. Previously viewed bytes cannot be recalled.
Billing is unchanged: no subscription cancellation, refund, fee or payment action.

Support is AOC-only while external access stays gated. Platform staff can request
`support.workspace.status.read` for a named client, ticket and reason, for
30 minutes. A distinct active agency administrator and a distinct active client
administrator must consent; neither may be the requester. Both assignments are
rechecked when the second approval arrives and when the grant is used. Denial,
expiry, suspension, revoked membership, inactive platform access or an Internal
identity prevent use. Authorized approvers can explicitly revoke an approved
request. Approval, denial, revocation, allowed/denied use and last-use metadata are
recorded. The only returned business value is `{portalEnabled: boolean}`. This
does not permit impersonation, chats, documents, source retrieval, tools, exports,
financial mutations or provider consent. Broader support actions need a separately
reviewed action/resource contract.

## Database setup and private local review

Migration `008_platform_console.sql` is additive and checksum-versioned. It adds
four ENABLE/FORCE-RLS owner-controlled tables: `platform_memberships`,
`agency_owners`, `platform_audit`, `support_requests`; plus agency state versioning
and narrow SECURITY DEFINER functions with fixed search paths. The runtime gets
only the explicitly listed functions. No existing administrator is seeded.
Use `lib/database.js` for the Next runtime; migrations use a short-lived
`pg.Client`, and explicit operator provisioning uses `lib/postgres.js` and the
existing operator-only Better Auth factory. The Stage 11 role guards and legacy shared
service model remain unchanged; this is **not** universal tenant RLS on legacy
tables. Owner credentials must never be used to start Next or Python.

For frontend review, prepare/restart a **retained disposable WSL PostgreSQL**
database with the synthetic Stage 04 prerequisites/adoption and migrations
003–007. Follow the existing Stage 03/04 runbooks; do not apply a synthetic
manifest to a real snapshot or run an empty-database fixture on an adopted DB.
The acceptance runner used fresh scratch clusters and removed them afterward;
its generated accounts/URLs therefore cannot be reused after closeout.

Create an ignored `.env.agency-test` **privately in this primary checkout** with:

| Name | Consumer / requirement |
| --- | --- |
| `DATABASE_URL` | Ordinary, reviewed non-owner runtime LOGIN on that loopback database |
| `AGENCY_MIGRATION_DATABASE_URL` | Separate local operator login, migration/bootstrap commands only |
| `BETTER_AUTH_URL` | Exactly `http://127.0.0.1:3000` for manual review |
| `BETTER_AUTH_SECRET` | Independently generated 32+ character local auth secret |

No values belong in Git or chat. The manual review profile was absent on this
computer; the automated rehearsal instead generated private process-only values.
The existing `.env.local` was neither copied nor changed. Never use its configured
Neon URL for these commands. The seeder/launcher refuse remote URLs, non-disposable
names, connection query overrides and unsafe/mismatched test setup.

From `C:\Users\MY PC\Desktop\AI\portal`, replace only the non-secret database
name and ordinary LOGIN placeholders with the verified local identities:

```powershell
node --env-file=.env.agency-test scripts/migrate-platform-console.mjs --confirm-database <aoc_stage04_rehearsal_hex> --app-role <ordinary_login>
node --env-file=.env.agency-test scripts/seed-platform-review.mjs --confirm-database <aoc_stage04_rehearsal_hex>
node --env-file=.env.agency-test scripts/dev-platform-review.mjs
```

The seeder creates **new synthetic** owner/contact accounts with random passwords,
records explicit owner assignment, and writes credentials only to ignored
`.tmp/platform-review/accounts.json`. It refuses to overwrite that file. Read the
generated owner credentials locally, sign in at
`http://127.0.0.1:3000/login`, then open
**`http://127.0.0.1:3000/platform`**. Use the generated contact's
`accountIdentifier` in the agency creation form. No existing Admin is promoted.
That contact has no platform or client permission. Additional agency/client
accounts for the full matrix come from the synthetic database test below.

The review launcher starts only loopback Next, excludes operator/provider secrets,
shadows local environment assignments, disables source workers and supplies an
unreachable loopback AI backend. Stop it with Ctrl+C and stop the disposable WSL
cluster using its recorded data directory/port. Provider-backed dashboard/AI
features intentionally need their own separately approved checks.

## Reproduce focused acceptance

On an approved synthetic fixture with Stage 03–11 fixture history, set
`AGENCY_WORKSPACE_TEST_DATABASE_URL` (operator), distinct runtime `DATABASE_URL`,
synthetic auth settings and ignored `AGENCY_ISOLATION_FIXTURE` privately. The
Stage 11 fixture produces the latter. Set `PLATFORM_CONSOLE_FIXTURE` to an ignored
`.tmp/<run>/platform-fixture.json` output, then:

```powershell
npm run test:platform:database
npm run test:platform:browser
node --test tests/platform-review.test.mjs
```

Start the matching isolated production Next server before the browser command;
its origin must equal the fixture/auth origin. Both suites refuse mismatched or
remote fixtures. The database suite is synthetic/stateful and creates new
accounts; use a fresh rehearsal fixture for a repeat. Do not run the default
`.env.local` database checks. Logs, account files, database dumps and screenshots
stay ignored. Actual commands/results and carried deployment gaps are in
[PROGRESS](PROGRESS.md) and [ISOLATION-EVIDENCE](ISOLATION-EVIDENCE.md).

No provider credential or sign-in was needed for Stage 12. A real initial owner
remains unassigned pending a separately approved secure account identifier. Live
AI, deployed private caching/CDN, deployed runtime/pooler roles, Google consent and
revocation, scheduler delivery, rotation/restore and supported-browser checks
remain open. No live billing/subscription integration is claimed. Stop before 13.
