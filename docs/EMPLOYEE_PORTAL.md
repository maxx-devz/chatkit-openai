# Employee Portal prototype

The Employee Portal is a separate, read-only work area with three focused workspace containers. **My Work** lives at `/employee`, **Team Workspace** at `/employee/team`, and **Settings** at `/employee/settings`. Better Auth remains the shared login system. After signing in, employee accounts visiting `/` are redirected to their first authorized employee workspace.

My Work contains the employee's own Overview, My tasks, daily plan, and Activity panels. Team Workspace contains only Team directory and Team tasks. Settings contains the personal Hubstaff connection. The sidebar switches between these containers with normal portal navigation; personal and team information are never mixed into one long dashboard. The employee layout remains mounted during those client-side transitions, and each workspace response is kept in a per-session browser memory cache so returning to a loaded workspace does not show another loading pass or call the dashboard endpoint again. The sticky shared header exposes the explicit **Refresh Hubstaff data** action in every workspace. A workspace link is shown only when at least one panel inside it is enabled, and direct page/API access is checked against the same stored policy on the server.

## Access architecture

Existing client authorization remains in `portal_memberships`; AOC staff authorization remains in `portal_admins`. The `portal_employees` table links to `portal_users` and contains the `employee` access type, job position, explicit panel-access policy, active flag, approved Hubstaff user ID, encrypted access and rotating refresh tokens, access expiry, connection version, and synchronization/rate-limit timestamps. Job position is intentionally separate from the security role: every employee record still has the fixed `employee` role. The migration adds missing position, panel-policy, and token-lifecycle columns to an existing employee table when needed. It does not update or delete existing application records.

The initial position presets are **Team Member** and **Project Manager**. Team Members receive My Work and Settings by default. Project Managers also receive Team Workspace with Team directory and the reserved Team tasks panel. An administrator can customize the explicit panel selection after applying a preset. The employee routes and navigation render from the stored policy; the server independently checks workspace access, Team directory, and Hubstaff-connection access before returning data or accepting a credential.

Client and admin data-access guards reject accounts with an employee record, including inactive employees and accidental overlapping memberships. This protects client APIs, ChatKit, assistant settings, client Hubstaff reads, client library, and administrator operations at their existing shared authorization boundaries. Employee endpoints independently verify the Better Auth session and active employee record on every request. Existing client/admin accounts keep their access when no employee table has been installed.

Provision employees as **new, distinct accounts**. The creation command refuses existing usernames and Hubstaff mappings. Do not assign employee records to existing client/admin accounts: employee exclusion intentionally takes priority. Disabling an employee should keep its employee record, set `is_active` to false, clear its encrypted token, and increment `connection_version`; deleting the record could re-enable an accidentally retained legacy membership.

## Administrator Employee Controls

Open **Administrator Portal → Employee controls** to create and manage employee-only accounts. Creation requires a display name, unique username, temporary password, approved numeric Hubstaff user ID, and position. The selected position applies its default panel policy. After creation, an administrator can change the display name, position, individual panel selections, approved Hubstaff identity, or active state. Panel controls are grouped under My Work, Team Workspace, and Settings to match the employee sidebar.

Changing the approved Hubstaff user ID clears the saved connection and requires the employee to reconnect. Pausing portal access also clears saved employee credentials and invalidates in-flight synchronization; reactivation never restores old credentials. Admin responses expose only connection status, never ciphertext or tokens. Run `npm run employee:migrate` before using Employee Controls after deploying this version.

The Team directory panel currently lists active portal employees with their position and connection status. The Team tasks permission and panel are deliberately reserved for the later organization-level integration. It does not aggregate other employees' personal tokens, return their tasks, or allow task assignment today. Organization-wide reads and task writes need a separately reviewed Hubstaff authorization model and scopes before that panel is activated.

## Development setup

Confirm that `.env.local` targets the intended development database. Preserve its existing values, particularly `BETTER_AUTH_SECRET` and `HUBSTAFF_TOKEN_ENCRYPTION_KEY`.

```powershell
npm run employee:migrate
npm run setup:check -- --employee
npm run employee:create -- USERNAME "DISPLAY NAME" APPROVED_HUBSTAFF_USER_ID
npm run dev
```

Replace the uppercase arguments with administrator-approved account details. Determine the correct Hubstaff user identity through your authorized Hubstaff administration process before provisioning. Do not accept a browser-supplied user ID as approval. The command prompts privately for a 12–128 character password; do not put passwords or tokens in command arguments, source, documentation, chat, or logs.

An employee uses the normal `/login` page, opens **Settings → Connect your Hubstaff account**, and supplies the initial **personal access token** shown by Hubstaff, with `hubstaff:read` and `tasks:read` permissions. Hubstaff issues this as a refresh token. The server exchanges it for a short-lived access token, verifies the approved user and Tasks access, and stores both returned tokens encrypted. On expiry or one API `401`, it renews the access token and persists Hubstaff's rotated refresh token. Organization tokens are not supported. Never paste the PAT into chat or a command line. A PAT bound to a DPoP key also requires signed DPoP requests and is not supported by this form.

Better Auth creates the authentication account before the employee mapping transaction. If mapping creation fails, the new login has no employee/client/admin access. An administrator must inspect and recover that newly created account before retrying. The command never converts an existing account or overwrites its role.

## Hubstaff reads and identity boundary

The server uses only these fixed provider endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST https://account.hubstaff.com/access_tokens` | Exchange the initial PAT and renew access with the current rotated refresh token |
| `GET https://api.hubstaff.com/v2/users/me` | Verify token ownership against the approved mapping on every connection/dashboard refresh |
| `GET https://api.hubstaff.com/v2/organizations` | List only organizations where the verified employee is an active member |
| `GET https://api.hubstaff.com/v2/organizations/{id}/activities` | Read the verified employee's activity blocks within exact configured-timezone boundaries for today and the current week |
| `GET https://tasks.hubstaff.com/api/v1/members/me` | Resolve the Tasks member ID used in assignments; it differs from the Hubstaff V2 user ID |
| `GET https://tasks.hubstaff.com/api/v1/projects` | Read projects accessible to that personal token |
| `GET https://tasks.hubstaff.com/api/v1/tasks/my/assigned` | Read assignments for the token's owner |

The mapping comes from the authenticated portal account, never the request. Tasks must also contain that Hubstaff user in `assignee_ids`, a consistent list identity, and a project present in the accessible-project result. Unexpected or unassigned records are excluded. Workflow labels come from each task's embedded list. Project filters/search/sort operate only on the already-authorized response in the browser.

The adapter follows bounded pagination (500 items per page, at most 10 pages per collection), uses a 45-second total deadline, and does not follow redirects or retry automatically. Weekly time reads are capped at ten accessible organizations and are always filtered to the already verified Hubstaff user ID. Today and week boundaries use the verified employee's `time_zone` from Hubstaff `/v2/users/me` and are converted to exact instants before querying raw activity blocks; organization-local daily labels are not used because they can disagree with the employee's reporting day. `HUBSTAFF_REPORT_TIME_ZONE` is only a fallback if Hubstaff omits or returns an invalid account timezone. Today AR and Weekly AR use Hubstaff's weighted activity formula: summed `overall` active seconds divided by summed `input_tracked` seconds. Time from sources without keyboard or mouse monitoring is excluded, and AR remains unavailable when there is no monitored input. If an organization plan or permission blocks activity reads, task data remains available and the UI marks time as unavailable or partial. Hubstaff may delay activity data, so the summary is not a live stopwatch.

A truncated collection displays an explicit incomplete-snapshot notice. Counts represent the loaded snapshot, not guaranteed lifetime totals. Tasks are returned only when their project is still in the accessible-project list and the Tasks API confirms the current Tasks member as an assignee. Task descriptions are sanitized to remove markup, external links, email addresses, and credential-like values before crossing the server boundary. Direct task links are constructed only from validated numeric organization, project, and task IDs. No comments, pay rates, raw user profiles, tokens, or other employees' assignment data are returned. Recent activity uses task `updated_at`, not a comment feed. Due-soon means within three days; date-only deadlines run to the end of the viewer's local day.

Provider protocol origins are fixed constants, not environment-specific tenant URLs. No employee, client, organization, or project IDs are hardcoded in application logic. This integration never uses the shared client Hubstaff token store or refresh path. Access tokens are reused until close to expiry, so Hubstaff's PAT exchange rate limit is not consumed on every dashboard refresh.

Official references: [current user](https://developer.hubstaff.com/reference/users/), [accessible projects](https://developer.hubstaff.com/tasks/reference/projects/), [my assigned tasks](https://developer.hubstaff.com/tasks/reference/tasks/), [access-token lifecycle](https://developer.hubstaff.com/authentication/).

## Credential handling

The password field is a server-rendered native HTML form. It posts directly to `/api/employee/connection`; frontend JavaScript does not read the value, put it into React state, or store it. As with any password form, the person entering the credential and their browser can inspect their own input and outgoing request. The server never embeds a saved token into markup, JavaScript, URLs, or responses.

The connection handler validates origin, session, active employee access, exact form fields, and body size. It exchanges the PAT and confirms identity and Tasks API access before replacing a working connection. Only a fixed status code appears in the redirect URL. Use HTTPS outside loopback development. Request bodies and Authorization headers must remain excluded from infrastructure logging.

Tokens are encrypted using the existing AES-256-GCM helper with a derived key bound to both the portal user and approved Hubstaff identity. Moving a ciphertext to another employee record cannot decrypt it. The root key stays in the existing server-only `HUBSTAFF_TOKEN_ENCRYPTION_KEY`; changing it requires reconnecting affected employees and can affect the pre-existing client PAT store, so do not casually rotate it during setup. A database row lock serializes refreshes so concurrent requests do not reuse a rotated token.

Connection/refresh attempts have a 15-second cooldown enforced in PostgreSQL across server instances. A successful connection permits its initial dashboard refresh immediately, but cannot bypass the reconnect cooldown. Writes and synchronization completion compare the active flag, approved mapping, and connection version to reject stale operations after a connection change or deactivation. Responses use `private, no-store`; no shared or persistent task cache is used. The employee layout keeps only the signed-in tab's already-loaded workspace responses in memory until the layout is unloaded, and an explicit header refresh replaces the personal workspace snapshot. Provider errors are converted to fixed friendly messages without forwarding response bodies or exception text.

## Files and verification

Employee portal code is isolated in `lib/employee-*`, `components/employee`, `app/employee`, and `app/api/employee`. Employee administration uses the existing protected admin data boundary, `/api/admin/employees`, and `components/admin/employee-controls.js`. Client controls, the existing client Hubstaff adapter, Python backend, ChatKit, and assistant logic remain unchanged.

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

The browser suite runs the real employee dashboard/form in a separate UI harness on port 3100 with synthetic task responses. It checks desktop/mobile layout, horizontal overflow, filters, loading/empty/error states, persistent workspace navigation, request reuse, shared-header refresh, and native token submission. It requires Google Chrome installed locally. Test screenshots are written to ignored `test-results/`.

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
