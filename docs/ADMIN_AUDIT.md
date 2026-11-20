# AOC administrator activity and diagnostics


## Current policy: submitted actions and committed values ? 2026-11-20

This section supersedes earlier browser/GET recording described in the historical implementation notes below.

- Record submitted POST, PUT, PATCH and DELETE admin actions, including denied/failed/cancelled attempts. Updating data uses PUT/PATCH or an explicit POST action; HTTP UPDATE is not used.
- Do not write audit entries for page navigation, clicks, checkbox/field edits, filters, ordinary GET/HEAD/OPTIONS reads or known arithmetic previews/model-catalog requests. Opening the audit log no longer creates another AOC audit-read row. Browser collection is disabled; its old POST endpoint acknowledges stale tabs without storing their events.
- Keep the two OAuth GET callbacks as explicit exceptions because completing them saves a credential grant. Existing authentication POST security records remain separate and exclude credential inputs. Other read diagnostics belong to operational logging, not this change report.
- Filter prior browser/read entries out of the general report and historical admin table. Existing stored history is preserved; nothing was deleted or relabelled as a save. The manifest lists auditedMethods and known preview exclusions.
- Expand an action to see Submitted values and Confirmed saved values separately. Client snapshots come from the actual database-returned client row. Monthly-plan and credit-operation snapshots are captured only after COMMIT succeeds. Provider/builder/pricing/reset response projections use explicit safe shapes. A generic success without an authoritative snapshot does not invent individual saved values.
- Confirmed values include approved business fields such as client name/identifier, enabled switches, monthly portal price, included credits, status, safe model metadata, generation switches, journey stages and selection counts where available. Numeric/boolean values retain their meaning. Website domains/project identifiers are reduced to safe representations without query strings or credentials.
- Never copy arbitrary request JSON. Passwords, API/OAuth tokens, secrets, cookies, email inputs, payment references, free-form notes/reasons, prompts, instructions and document contents are excluded from the general audit values. Omitted field names are shown where recognized. Existing private business records are not modified by this redaction policy.
- Unknown fields are omitted. Metadata is bounded below the existing JSON size limit. Duplicate requests say no new change was made. If a committed change is followed by a later request error, the message explicitly warns that some values were saved; a rollback never labels input as committed.

Current verification: 396 top-level + 119 Internal/auth regressions passed (515); 58 admin desktop/mobile browser checks passed. Disposable WSL PostgreSQL verified the existing migration/role restrictions, exact legacy-write correlation, submitted-only query scope and disabled browser insertion. Injected transaction tests covered COMMIT failure and post-commit request failure. Full lint and isolated production build passed. Actual local inspection confirmed no browser POST telemetry, unchanged browser/read record counts during audit navigation/filtering, hidden-but-preserved old read history and a submitted-only report. The actual review blocked business writes; only normal sign-in/out security records were allowed. No schema, environment, real plan/balance, provider credential or role setup changed. Neon was untouched. Live provider mutations and financial operations were not used for verification.

No new environment configuration is required. Review `/admin/audit`. No commit or push was performed.

## Historical implementation notes (superseded where different)

## Review

- Overview: `http://127.0.0.1:3000/admin`.
- Audit: `http://127.0.0.1:3000/admin/audit`.
- Use the existing authorized AOC administrator login. Credentials stay in the private local setup.
- Actual source lives in this checkout's `app/`, `components/`, `lib/`, `database/`, `scripts/` and `tests/` paths. Temporary orchestration scripts are not application dependencies.

## What is recorded

`config/admin-audit-coverage.json` inventories 39 methods across all 24 existing AOC admin/builder routes. The wrapper retains each handler's existing authentication, origin, permission and business validation. The new audit transport is the sole explicit exclusion, avoiding self-recording recursion. Internal Portal routes and client authorization are unchanged.

For an authenticated request, `resolveAdminContext` establishes the audit actor after the existing active-AOC-admin and independent Internal-user checks. The attempt is persisted before the protected operation proceeds. The explicit GET report endpoints `/api/admin/ai-usage`, `/api/admin/ai-spending` and `/api/admin/presence` instead record one final outcome; they perform no business mutation and must remain readable during an audit-storage outage. Their authentication and permissions remain mandatory. All changes, resets and OAuth callbacks retain durable pre-action recording. A final append-only event contains server-generated request reference, timestamp, actor, client when known, operation, method, route without query strings, HTTP status, elapsed time, outcome, safe code and relative application code location where available. Client creation/update target IDs come from the authorized result. Unauthenticated or denied attempts are not falsely attributed to an administrator.

Failures handled by legacy error formatters contribute sanitized diagnostic codes and relative file/line locations. SQL, provider messages, raw stack traces and machine paths are excluded. Error explanations are generated from reviewed codes. Failed/cancelled OAuth callbacks retain that outcome even though the browser receives a redirect. Streaming assistant requests record completion after the stream drains, distinguish error frames from successful HTTP 200, and record cancellation separately.

Known AOC administrator sign-in attempts and sign-outs are observed through Better Auth; credentials remain managed by Better Auth. Successful sign-in requires its returned authenticated identity to match. Rejected attempts against an admin account have an unverified actor, not the account owner's identity. Client and Internal authentication remain independent. Admin server-render errors use Next's installed `onRequestError` instrumentation while preserving the existing debugger integration.

Admin-only browser recording covers navigation, button/link intent, committed field edits, native validation blocks and runtime/unhandled-promise errors. It sends small bounded batches using one atomic PostgreSQL insert rather than a per-event transaction loop, retries with bounded backoff while the page is active, and drains queued intents during navigation. Browser UUIDs are namespaced by actor so they cannot replace a server result. The server supplies actor and timestamps and only accepts approved event types. Browser events are labelled **Browser reported**, never confirmed saves.

Neither telemetry nor audit input metadata records passwords, tokens, OAuth codes/state, cookies, emails entered in forms, document contents, prompts/replies, free-text reasons or typed field values. Only approved setting names and selected numeric/boolean configuration fields are retained. There is no keystroke recording.

## Reading the log

The timeline filters by client, administrator, outcome, type and exact request reference, with explicit refresh and snapshot pagination. Expand a record for safe diagnostics. The request reference is also returned as `X-AOC-Audit-Reference`. Completed requests whose final audit append failed carry `X-AOC-Audit-Status: incomplete`.

Older administrative records, integration runs and AI usage remain below the timeline. The new timeline is prospective; it cannot reconstruct previously unrecorded actions or errors. Integration/job completion is still represented by the existing integration-run records; a successful queue submission is not a claim that all background work completed.

## Storage and failure behavior

- `database/admin-operation-audit.sql` uses standard PostgreSQL types, indexes, constraints and parameterized queries. No provider SDK, extension or browser database access is introduced.
- Runtime uses `lib/database.js`. `portal_admin_operation_audit` is append-only for the configured ordinary runtime role: SELECT/INSERT plus sequence access, no UPDATE/DELETE. This is not a claim of tenant RLS or immutability against the database operator.
- The versioned migration records a SHA-256 checksum and refuses modified applied SQL. It revokes PUBLIC, `anon` and `authenticated` grants, including permissive provider defaults. It is repeatable.
- If the initial durable audit write fails, the protected handler cannot proceed beyond its existing admin authorization hook. If completion recording fails after the operation finished, its real response is preserved to avoid encouraging a duplicate financial/settings action. The started record remains with **Outcome not recorded**, and a safe server diagnostic contains the reference.
- Interrupted/crashed requests may retain only their started event. Check the affected record before retrying; a failed HTTP response alone does not prove every legacy side effect rolled back.
- Browser recording is best effort: disabled JavaScript, offline tabs, a hard process crash, queue limits or failed final delivery can prevent UI events reaching the server. A visible warning reports observed transport failure/overflow. It cannot guarantee capture of every physical interaction or failures before the application starts. Authentication audit failure reports a safe operational diagnostic without breaking independent auth flows.
- No automatic deletion or retention policy was introduced. Establish an approved retention/export policy before long-term deployment; do not silently delete existing audit history.

## Environment setup

Runtime needs the existing private `DATABASE_URL` and Better Auth configuration. No new provider credentials are required.

For another environment, put `ADMIN_AUDIT_MIGRATION_DATABASE_URL` privately in its ignored operator environment (or inject it through the private setup shell). It is an operator connection, never a browser setting or routine runtime login. Preview first:

```powershell
npm run audit:operations:migrate -- --confirm-database APPROVED_DATABASE --app-role ORDINARY_RUNTIME_ROLE --dry-run
```

After approval, repeat without `--dry-run`. A remote target also requires `--allow-remote`; verify the target before applying. Do not point disposable verification at a shared database.

Database checks use `ADMIN_AUDIT_TEST_DATABASE_URL` supplied privately and reject non-loopback/non-disposable targets:

```powershell
npm run test:audit:operations:database
```

## Verification — 2026-11-20

- Disposable WSL PostgreSQL with synthetic users/clients: preview leaves no schema, first/repeated migration passes; actual non-owner, non-superuser runtime can append/read but cannot update/delete audit history. PUBLIC/provider browser roles have no direct access. Unfinished attempts, final failure details, duplicate replay, client/actor/reference filtering, browser/server UUID separation, sensitive-input exclusion and single-connection pool reuse passed.
- Offline suites: **383 top-level tests + 119 Internal/auth regressions passed**. These include the real audit runner with injected storage, concurrent ALS contexts, stream failures/cancellation, OAuth redirect outcomes, protected endpoint denial, privacy and auth-observer tests. Injected dependency tests are not live provider tests.
- Admin desktop/mobile browser fixtures cover Overview cards, diagnostic expansion, filtering, unknown outcomes, browser privacy, transport warnings and pending-batch navigation; client browser regressions cover existing client behavior. **44 admin + 38 client browser checks passed (82 total)**. The initial accessibility-label issue and a mobile test attempting to click the closed navigation were corrected before the final passing run. Exact results are also recorded in `PORTAL_UI_REVIEW.md`.
- Full ESLint and isolated production build passed. Build uses disabled loopback database/provider configuration, not live credentials.
- The new schema was previewed and applied to the previously approved fresh Supabase target after private identity verification. **All 74 pre-existing table row counts were unchanged**. `.env.local` was unchanged; Neon was never contacted. Existing business data and plan balances were not edited by verification.
- Actual local admin review passed on desktop/mobile with confirmed server request/reference retrieval and anonymous audit denial. Business-setting writes were blocked; only normal authentication and audit writes were allowed. Google, Hubstaff, AI provider calls and deployment delivery were not exercised.
- Local review remains available on port 3000 with provider workers disabled. No branch change, push or commit was performed for this task.


## Usage-page follow-up ? 2026-11-20

The reported usage-page warnings were investigated using the ordinary runtime role. Schema, INSERT/SELECT and sequence permissions were healthy; an audit-only diagnostic transaction was rolled back. The exact intermittent failure was not reproduced. Recent recorded requests reached approximately 8.3 seconds. Inspection found avoidable pool pressure: each browser batch could hold the single-connection pool across up to 25 sequential inserts, plus polling reads required a pre-read audit insert.

Browser batches now use one atomic `jsonb_to_recordset` INSERT with deduplication and current server actor. Failed delivery retries back off instead of retrying every two seconds indefinitely. The three explicit polling reports record final outcomes once and continue returning authorized data if audit storage fails; `X-AOC-Audit-Status: incomplete` remains explicit. Usage/spending display a recording warning while keeping valid report data visible. This exception does not permit any unauthenticated read or bypass the pre-action guard on writes/resets/OAuth GET callbacks.

Verification: 386 top-level + 119 Internal/auth regressions passed; all 48 admin desktop/mobile browser checks passed. Disposable WSL PostgreSQL verified 25-event batch atomicity, failed-batch rollback and replay alongside existing role/privacy/filter checks. Lint and isolated production build passed. Actual local usage, spending and browser audit requests returned HTTP 200 with no recording/unstarted-action warnings; business-setting writes were blocked during review. No shared schema, private environment, connection role, balances or client settings were changed. Live providers were not called; Neon was untouched.


## Historical table response details ? 2026-11-20

The Historical admin records table now uses readable action labels (for example, Updated client settings and Granted client administrator access) and meaningful targets such as Client #2, Account #62 and Audit log. New end columns show HTTP status/result and Log details / What happened. Expand View request log for the reference, method/path, duration, safe diagnostic code and code location when recorded. Status codes retain their meanings (200 OK, 201 Created, 404 Not found, etc.); an HTTP 200 stream that failed still shows Failed as its outcome.

New legacy action IDs are captured from INSERT RETURNING and linked to the final authenticated server request through its existing `details.legacy_events` array. Client create/update SQL and the generic AOC audit writer emit exact action/access IDs. Read-only enrichment checks the event kind/ID, server origin, actor and non-null client ownership before exposing a response. Ambiguous links stay unconfirmed. It does not match by timestamp, display name, action label or target alone. Older events and direct page records without a captured response explicitly show Not recorded / Event recorded. Missing enrichment does not manufacture a successful response.

No database schema change, backfill, private configuration or new provider setting is required. Existing rows remain unchanged. The API/page retain their existing active AOC administrator authorization; Client and Internal views are not changed.

Verification: 392 top-level + 119 Internal/auth regressions passed (511). All 50 admin desktop/mobile browser checks passed. Disposable PostgreSQL used the actual create/update SQL templates to verify paired creation/access event IDs and exact 201/200 response links; wrong actor/client links were denied and unlinked older records stayed unknown. Generic audit-writer correlation passed. Full lint and isolated production build passed. Actual local review verified an audit-read event linked to its precise HTTP 200 request and readable table row, on desktop/mobile. Only normal auth/audit writes were allowed; no client settings, balances, provider credentials, schema or environment files changed. Neon untouched. Server restored for local review; no push or commit.


## Compact expandable activity table ? 2026-11-20

Replaced the activity cards with a compact six-column table: Activity, When, Client, Administrator, Result and Message. Browser operations use readable labels such as Opened a page and Edited a field. Short messages remain in the row; full explanations, request references, HTTP results and safe diagnostic fields appear in a detail row below it.

Select any non-interactive cell or the chevron button to expand; select again to collapse. Rows expand independently. Native buttons expose aria-expanded/aria-controls and support Enter/Space. Horizontal scrolling stays inside the table on small screens; expanded diagnostic content wraps. Refresh/filter/pagination reset the displayed snapshot's expansion state. Expanding a row does not fetch or mutate business data. Existing browser recording recognizes row interactions without capturing row text or field values.

Verification: all 52 admin desktop/mobile fixture checks passed, including repeated row/button/touch/keyboard toggles, diagnostic visibility, no extra data reads and no page overflow. Changed frontend modules passed lint; isolated production build passed. No database schema, provider setup or backend authorization change was made. The local review server was restored; no commit or push.
