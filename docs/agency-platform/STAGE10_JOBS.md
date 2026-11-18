# Stage 10 background work contract and local rehearsal

Implementation checkout: `C:\Users\MY PC\Desktop\AI\portal`, branch
`feat/agency-platform`, built on Stage 09 `48a5043` plus handoff `50c0ee1`.
This is a local, synthetic verification record. No production migration,
deployment, scheduler registration or provider request is implied.

## Existing paths reused

| Work | Producer and resource | Execution and recovery | Output audience |
| --- | --- | --- | --- |
| Hubstaff index | Authorized legacy Admin queues the saved client project; restricted cron/local operator selects saved mappings | Existing client lease, task/comment cursors, upserts, scan generations, denial/backoff and persisted attempt counts | The assigned AOC client; existing Admin monitoring retains its all-AOC estate guard |
| Prepared Drive sources | Authorized AOC publisher or restricted source cron/local worker; owner ID resolves the saved connection | Existing owner lease, atomic encrypted corpus, revision reuse and fail-closed failure marker | Preparation grants no publication permission: Stage 08 approved revisions and separate private Admin/client audiences still control retrieval |
| Website Insights report | A current Member/Client Administrator starts or resumes a report in an assigned client; original `started_by` remains provenance | Existing report/client/site keys, one-running-report constraint, 130-second lease, saved batches and lease-token writes | Authorized members of that client; private report reads/exports retain Stage 06/07 checks |
| Other reports | Cost/credit reports remain authorized synchronous reads/exports | No delivery queue or new email/Make action introduced | Existing client/operator policy |

Internal Hubstaff authorization is independent and unchanged. Local watchers run
only while their Node process runs. Website Insights remains browser-resumed;
its Pause/Resume control is not an unattended cron worker. Logging out does not
authorize a new report batch. Already running work must still pass its final check.

## Enforced contract

Migration `007_background_jobs.sql` adds a protected `job_runs` ledger. It stores
only kind, resource locator, explicit agency/client binding, a configuration hash,
random lease token, deadlines and bounded status codes/counters. No credential,
document text, prompt, arbitrary destination or queue-supplied agency grant is
stored. Null client ownership denotes the explicit agency source publisher,
never a platform-wide grant.

`job_scope` resolves live ownership from authoritative tables. It checks the
active AOC ownership marker and agency, client enablement and Hubstaff AI flag,
or the active Drive publisher and connection ledger. Reports additionally check
the current Better Auth session, non-Internal identity, active agency/client
memberships, assignment and effective write role. A current permitted member may
resume another member's saved report: `started_by` is an audit field, not a grant.
Neither an agency selector nor a stale session confers authority.

Source versions include connection generation, saved OAuth app/root and connection
time. Report versions include site URL and Search Console generation, including
the transition from no saved binding. The same connection advisory lock used in
Stage 09 fences first-connection races. Hubstaff uses the database mapping hash
and its existing JavaScript binding hash for project/provider credential changes.
A rotated deployment credential is private configuration; an already paused
Hubstaff job needs an authorized Queue/Sync retry after correcting it.

Admission uses a transaction advisory lock per agency and permits at most **five
active jobs across all three kinds**, shared across worker processes. Each
kind/resource admits one active token. Existing resource leases still own actual
cursors and result writes. The agency ledger lease lasts 150 seconds; work has a
110-second maximum signal budget. Expired workers cannot update a replacement
worker's state or release its token. Process loss recovers after lease expiry,
not immediately. No new queue service or provider-specific extension is required.

Workers recheck before provider batches, source file reads, crawl requests,
transactional saves and final delivery. Final checks lock the applicable agency,
client, grant and connection rows through the result commit. Suspension,
revocation, changed ownership/version or an expired token prevents that commit.
An external request already in flight may finish; these checks withhold its
output. They cannot retract earlier responses or already committed history.

Automatic failures use 30/60/120/240/300-second backoff and stop after five
consecutive failures. Source/report timeouts count; user cancellation does not.
Hubstaff's intentional deadline slices preserve cursors and remain resumable.
Success resets the counter. Existing authorized Queue/Sync, source Synchronize
and report Resume controls can explicitly reset/retry. Retry never bypasses
current access or an active lease. Error text and cron/log output contain bounded
codes/counts, not provider responses, source bodies or credential values.

Candidate selection excludes suspended, foreign, active-lease, paused and
backoff records before its limit, ordering eligible resources by oldest attempt.
Repeatedly queueing one project cannot starve unattempted work. SQL ranks turns
per agency, but **only AOC integrations are enabled/tested for execution**.
Foreign agencies cannot inherit these providers. Multi-agency provider throughput
and fairness under real load are not certified; the Stage 11 gate remains shut.
Hubstaff retains its 18-second cron/10-second client slices. Source cron defaults
to three owners, a 90-second invocation budget and at most 85 seconds per owner.
Source corpora remain atomic, with their existing 100-document/two-reader limits.

## Database privilege boundary

The ledger has ENABLE/FORCE RLS and a dedicated owner policy. The ordinary legacy
app login cannot read/write the ledger directly. It receives narrow resolver,
claim/check/finish/retry/candidate functions, which use fixed search paths and
parameterized resource identifiers. Functions use the shared server's service
credential; report actor/session arguments must come from trusted authentication.
They are not browser database endpoints or separate user-scoped DB logins.

PostgreSQL requires UPDATE privilege on at least one column for these row locks.
The operator runner grants the **non-login dedicated owner**, not a tenant role,
key-column UPDATE on clients, users, sites, sessions, memberships, admins and
Drive connections. The functions do not update those keys. Earlier owner SELECT
grants and migrations remain prerequisites. The migration validates a non-owner,
non-superuser, non-BYPASSRLS runtime login and checksum, and closes its pg client.
The legacy runtime still has legacy backing-table privileges. This does not
claim that every legacy table is protected by RLS from that credential.

Pre-adoption installations retain their existing legacy authorization/leases.
An adopted database missing migration 007 fails closed. Apply it to an approved
target before deploying its workers. Do not silently bypass a missing function.

## Repeat the local checks privately

1. Recreate disposable loopback WSL PostgreSQL using the Stage 03/04 runbooks.
   Use synthetic legacy clients, the separate owner/operator and app logins,
   Better Auth test sessions and Stage 05–09 fixtures. Do not restore real
   customer data or use the configured Neon URL.
2. Privately set `AGENCY_MIGRATION_DATABASE_URL` for the migration operator,
   `AGENCY_WORKSPACE_TEST_DATABASE_URL` for fixture administration, and a distinct
   runtime `DATABASE_URL` for that **same disposable database**. Supply synthetic
   `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` to the test process. Do not put URLs
   or passwords into chat, committed docs or runtime browser configuration.
3. Ensure the existing Hubstaff, prepared-source, Website Insights and Internal
   schemas are available with their documented owner read/runtime privileges.
   Apply earlier agency migrations/fixtures in their documented order.
4. Run `npm run agency:jobs -- --confirm-database <disposable-name> --app-role <runtime-login>`.
   Run it twice to check the recorded migration checksum/idempotence.
5. With the same private fixture environment, run:

   ```powershell
   node --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test tests/agency-backfill/jobs.database.test.mjs
   node --conditions=react-server --test tests/hubstaff-index/*.test.mjs tests/drive-sources/*.test.mjs
   node --test tests/*.test.mjs
   node --conditions=react-server --experimental-test-module-mocks --import ./tests/internal-user/aliases.mjs --test tests/internal-user/*.test.mjs
   ```

   The database fixture refuses non-loopback and non-disposable-named targets.
   It uses actual PostgreSQL, application leases, transactions and encryption;
   Hubstaff/Drive responses and report Google results are synthetic mocks. The
   expired-lease replacement claim runs in a separate Node process. Expiry is
   advanced in the fixture rather than waiting for or killing a real provider run.
6. Run the full production build with all private `.env*` names shadowed and an
   unreachable synthetic loopback database/provider target. Do not let a build
   load the configured Neon credentials. Stop/remove the disposable cluster.

No new environment variable or production secret was introduced. Existing
operator-only names above are absent/empty in `.env.local` on this machine;
the rehearsal supplied generated values only to isolated child processes.

## Scheduler setup remains a separate verification

No root `vercel.json` scheduler exists. Existing runbooks describe an external
timer; its dashboard, registration, delivery, deployed host and protection bypass
were not inspected or changed. Do not infer that deploying a handler starts it.

| Existing setting | Runtime and private configuration location | Observed locally |
| --- | --- | --- |
| `HUBSTAFF_INDEX_SYNC_SECRET` or `CRON_SECRET` | Next.js deployment secrets and the scheduler's Authorization bearer header for `/api/cron/hubstaff-index`; at least 32 characters | Absent/empty |
| `SOURCE_SYNC_SECRET` or `CRON_SECRET` | Next.js deployment secrets and the scheduler's Authorization bearer header for `/api/cron/source-sync`; at least 32 characters | Absent/empty |
| `LOCAL_HUBSTAFF_INDEX_SYNC`, `LOCAL_SOURCE_SYNC` | Private local Node environment; optional dev watchers, not serverless scheduling | Names present; no workers were started against the configured environment |
| `AGENCY_MIGRATION_DATABASE_URL`, `AGENCY_WORKSPACE_TEST_DATABASE_URL` | Approved disposable test shell only, distinct from runtime credentials | Absent/empty; generated in the isolated rehearsal process |

Follow `docs/HUBSTAFF_SCHEDULER.md` and `STAGE09_CONNECTIONS.md` for existing
provider settings and Google read scopes. No provider consent is needed for
these fixtures. A live check requires a named test deployment, provider account,
resources and redirect URLs; the user completes sign-in/consent privately.

## Remaining boundaries

Actual results are in PROGRESS. Live AI/provider revocation, deployed scheduler
execution, secret rotation/restore, Stage 06 browser verification, live CDN and
browser back/forward checks remain pending. Google-side revocation can remain
undetected until the next provider/source check or the existing 15-minute source
freshness limit. Database-side suspension/generation changes are checked at the
next job checkpoint. No claim of instant recall or instant provider cancellation
is made. Stage 20B still owns publication approval transitions. Stop before 11;
no production migration, external message, payment, deployment or push is authorized.
