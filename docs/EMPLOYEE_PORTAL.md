# Employee Portal prototype

The employee dashboard is a separate, read-only work area at `/employee`. Better Auth remains the shared login system. After signing in, employee accounts visiting `/` are redirected to `/employee`.

## Access architecture

Existing client authorization remains in `portal_memberships`; AOC staff authorization remains in `portal_admins`. The new `portal_employees` table links to `portal_users` and contains the `employee` access type, active flag, approved Hubstaff user ID, encrypted access token, connection version, and synchronization/rate-limit timestamps. The migration only creates this table. It does not update or delete existing application records.

Client and admin data-access guards reject accounts with an employee record, including inactive employees and accidental overlapping memberships. This protects client APIs, ChatKit, assistant settings, client Hubstaff reads, client library, and administrator operations at their existing shared authorization boundaries. Employee endpoints independently verify the Better Auth session and active employee record on every request. Existing client/admin accounts keep their access when no employee table has been installed.

Provision employees as **new, distinct accounts**. The creation command refuses existing usernames and Hubstaff mappings. Do not assign employee records to existing client/admin accounts: employee exclusion intentionally takes priority. Disabling an employee should keep its employee record, set `is_active` to false, clear its encrypted token, and increment `connection_version`; deleting the record could re-enable an accidentally retained legacy membership.

## Development setup

Confirm that `.env.local` targets the intended development database. Preserve its existing values, particularly `BETTER_AUTH_SECRET` and `HUBSTAFF_TOKEN_ENCRYPTION_KEY`.

```powershell
npm run employee:migrate
npm run setup:check -- --employee
npm run employee:create -- USERNAME "DISPLAY NAME" APPROVED_HUBSTAFF_USER_ID
npm run dev
```

Replace the uppercase arguments with administrator-approved account details. Determine the correct Hubstaff user identity through your authorized Hubstaff administration process before provisioning. Do not accept a browser-supplied user ID as approval. The command prompts privately for a 12–128 character password; do not put passwords or tokens in command arguments, source, documentation, chat, or logs.

An employee uses the normal `/login` page, opens the native **Connect your Hubstaff account** form, and supplies a current **personal access token** with `hubstaff:read` and `tasks:read` permissions. The initial PAT **refresh token** and organization token are not supported. This feature does not exchange or refresh tokens: Hubstaff's exchange endpoint requires POST. Expired access tokens must be replaced through the form. Use existing authorized tooling to obtain an access token; never paste it into chat or a command line.

Better Auth creates the authentication account before the employee mapping transaction. If mapping creation fails, the new login has no employee/client/admin access. An administrator must inspect and recover that newly created account before retrying. The command never converts an existing account or overwrites its role.

## Hubstaff reads and identity boundary

The server uses only these fixed provider endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET https://api.hubstaff.com/v2/users/me` | Verify token ownership against the approved mapping on every connection/refresh |
| `GET https://tasks.hubstaff.com/api/v1/projects` | Read projects accessible to that personal token |
| `GET https://tasks.hubstaff.com/api/v1/tasks/my/assigned` | Read assignments for the token's owner |

The mapping comes from the authenticated portal account, never the request. Tasks must also contain that Hubstaff user in `assignee_ids`, a consistent list identity, and a project present in the accessible-project result. Unexpected or unassigned records are excluded. Workflow labels come from each task's embedded list. Project filters/search/sort operate only on the already-authorized response in the browser.

The adapter follows bounded pagination (100 items per page, at most 10 pages per collection), uses a 25-second total deadline, and does not follow redirects or retry automatically. A truncated collection displays an explicit incomplete-snapshot notice. Counts represent the loaded snapshot, not guaranteed lifetime totals. No task descriptions, comments, pay rates, raw user profiles, tokens, or other employees' assignment data are returned. Recent activity uses task `updated_at`, not a comment feed. Due-soon means within three days; date-only deadlines run to the end of the viewer's local day. Workload means task counts, not hours or capacity estimates.

Provider protocol origins are fixed constants, not environment-specific tenant URLs. No employee, client, organization, or project IDs are hardcoded in application logic. This integration never uses the shared client Hubstaff token store or refresh path.

Official references: [current user](https://developer.hubstaff.com/reference/users/), [accessible projects](https://developer.hubstaff.com/tasks/reference/projects/), [my assigned tasks](https://developer.hubstaff.com/tasks/reference/tasks/), [access-token lifecycle](https://developer.hubstaff.com/authentication/).

## Credential handling

The password field is a server-rendered native HTML form. It posts directly to `/api/employee/connection`; frontend JavaScript does not read the value, put it into React state, or store it. As with any password form, the person entering the credential and their browser can inspect their own input and outgoing request. The server never embeds a saved token into markup, JavaScript, URLs, or responses.

The connection handler validates origin, session, active employee access, exact form fields, and body size. It confirms identity and Tasks API access before replacing a working connection. Only a fixed status code appears in the redirect URL. Use HTTPS outside loopback development. Request bodies and Authorization headers must remain excluded from infrastructure logging.

Tokens are encrypted using the existing AES-256-GCM helper with a derived key bound to both the portal user and approved Hubstaff identity. Moving a ciphertext to another employee record cannot decrypt it. The root key stays in the existing server-only `HUBSTAFF_TOKEN_ENCRYPTION_KEY`; changing it requires reconnecting affected employees and can affect the pre-existing client PAT store, so do not casually rotate it during setup.

Connection/refresh attempts have a 15-second cooldown enforced in PostgreSQL across server instances. A successful connection permits its initial dashboard refresh immediately, but cannot bypass the reconnect cooldown. Writes and synchronization completion compare the active flag, approved mapping, and connection version to reject stale operations after a connection change or deactivation. Responses use `private, no-store`; no shared task cache is used. Provider errors are converted to fixed friendly messages without forwarding response bodies or exception text.

## Files and verification

Employee code is isolated in `lib/employee-*`, `components/employee`, `app/employee`, and `app/api/employee`. Existing application changes are limited to the two shared access guards, the root redirect, inclusive login wording, setup checks, and package/documentation entries. Client/admin dashboards, the existing Hubstaff adapter, Python backend, ChatKit, and assistant logic are unchanged.

```powershell
npm test
npm run test:employee
npm run test:employee:database
npm run test:employee:ui
npm run lint
npm run build
npm run test:employee:secrets
.venv\Scripts\python.exe -m unittest discover -s chatkit_backend/tests -v
```

The employee unit/route tests use synthetic credentials and mocked provider responses. Actual Better Auth login and session verification run against an in-memory SQLite database using the application's auth configuration. PostgreSQL tests use temporary tables inside a rolled-back transaction, testing additive/idempotent schema, preserved legacy fixtures, unique mapping, encrypted isolation, rate limiting, stale writes, and revoked access. No model calls are made.

The browser suite runs the real employee dashboard/form in a separate UI harness on port 3100 with synthetic task responses. It checks desktop/mobile layout, horizontal overflow, filters, loading/empty/error states, and native token submission. It requires Google Chrome installed locally. Test screenshots are written to ignored `test-results/`.

With both local services running, an additional **development-only** authenticated test is available:

```powershell
npm run test:http
npm run test:employee:http -- --development-fixtures
```

The opt-in employee HTTP test creates uniquely named client/admin/employee fixture accounts in the configured development database, logs in through the real HTTP API, checks routing and role denials, and exercises client Hubstaff's unconfigured state and signed ChatKit history. It removes only its own fixture records in `finally` and compares existing client, admin, membership, and ChatKit snapshots. Run it only against a confirmed development database with the local frontend origin; it is not a production health-check script. Interrupted processes may leave `smoke-` fixtures requiring exact-record cleanup.

Release verification still needs an approved real employee account and current personal Hubstaff token, plus a preview smoke test of real client/admin workflows, connected client Hubstaff data, and an authorized AI reply. Synthetic/provider-mocked tests do not prove real token scopes, upstream account configuration, billing, or live production behavior. Do not deploy until those checks pass.

## Rollback

Keep this feature on its branch until reviewed. Stop the local processes before switching application revisions. If abandoning the feature before any employee accounts are provisioned, leave the additive table in place; the prior application ignores it. Do not drop existing client, admin, auth, ChatKit, usage, or integration tables.

After employee accounts exist, first disable their access, revoke their Better Auth sessions, clear saved employee tokens, and confirm that they have no legacy memberships or admin rows before reverting the employee guards. Keep the employee mapping rows for audit/recovery. The prior code grants no access to employee-only accounts because they have no client membership or admin record. No production deployment, merge, or push is part of this implementation.
