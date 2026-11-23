# Client Document Library

Branch: client-documents, created from master916bbf5 in AI\portal.

**Current checkpoint: simple title/description Document Library, 2026-11-23.**

File-action follow-up: open buttons now use available MIME type, Google editor
link or filename extension (PDF, Docs, Sheets, Slides, Office, image/text), with
Open file for unknown types. Protected Google exports correctly say View PDF.
No Google metadata request, raw-source URL disclosure or migration. 46 fixture
browser checks, 402 offline tests, 31 disposable database reported checks, lint
and isolated build passed. Existing files need no re-upload; refresh the library.


Screenshot follow-up: hidden/visible transitions no longer clear the rendered
document list or abort its initial read. Access is revalidated silently on return;
denial clears content and client switches discard prior scope. Previously rendered
metadata can remain until the recheck completes; file access is always server
authorized. 44 desktop/mobile fixture checks, lint and isolated build passed.
Native Lightshot itself was not automated. No real data or configuration changes.


Latest follow-up: the authenticated Documents page now loads its authorized
initial list on the server, so it is readable before hydration and without a
second browser API request. The existing 20-second timeout/retry still protects
search, paging and tab-return reads. Initial results are bound to the current
client; tab return reauthorizes, and no shared document cache was introduced.

Actual results for this follow-up: 24 desktop/mobile component-browser checks,
4 full-app real-auth/SQL Chrome checks, 399 offline tests, changed-file/test lint
and isolated production build passed. Full-app checks prove initial rendering
with the document API blocked, with JavaScript disabled, foreign-client denial
and membership revocation on reload. Google transport is not live-verified.
The four database suites were also rerun on disposable WSL PostgreSQL: 31
reported passes (including parent tests), with legacy Google transport mocked.
No Supabase/Neon write, real-client publication or environment change occurred.
A previous read-only Supabase diagnostic confirmed one published gogrit link.
The user's existing Chrome profile/network failure was not directly inspected;
the console extension/preload/source-map warnings do not establish its cause.

Changed real project paths for server loading: app/page.js,
components/portal/client-portal.js and client-official-documents.js. Retained
coverage: tests/admin-readiness/browser/document-loading.spec.mjs and
tests/client-document-assignments/browser/server-rendered-library.spec.mjs,
plus the scoped fixture route. The app snapshot under .tmp was used only for
isolated builds/browser verification; intended changes also exist in real paths.
No new setup variables or migration. Refresh /?view=documents on the running
port 3000 to review using the existing authorized client login. No commit/push.

At the user's explicit request, removed journey progress, next actions and stage/
type selectors from both admin and client document screens. The main admin fields
are Document title, optional Description and Google Drive file link. Publication
still requires the administrator's client-facing/sharing confirmation. Clients see
shared titles/descriptions and their open action, with simple title search.

Descriptions reuse existing revision-scoped audit JSONB metadata. No migration,
Google OAuth configuration or private environment changes are required. Existing
journey records, older metadata, optional protected downloads, access controls,
publication history and the focus-reload fix are preserved. No real link or client
record was changed during verification.

Passed: 24 desktop/mobile document interaction cases plus 2 client-portal layout
cases, 31 disposable PostgreSQL checks, 399 offline regressions, lint and an isolated
production build. Browser APIs/legacy Google transport are fixtures; database checks
use real auth/SQL. Live Google permissions/downloads remain unverified. The retained
real-auth document browser suite was updated for the new scope but was not rerun.

Steps below are historical checkpoints, including earlier Google rollout blockers
that apply only to the optional protected-download integration.

## Step 1 - layout prototype only

The user requested gradual implementation ("konti-konti"), real Google sign-in
when required, and clearly labeled prototypes for unfinished work. This step adds
only the shared presentation and authorized admin preview. No database, Google
connection, publication, download service, payment or milestone is created.
No fake client accounts, documents, receipts or completed stages are introduced.

Review routes after signing in through the existing portal:
- /admin/client-documents: authorized AOC administrators; includes planned admin flow.
- /admin/client-documents?preview=client: same admin authorization, client-layout preview.
- /?view=documents&journeyPreview=1: signed-in client's Documents view with opt-in layout preview.
- /?journeyPreview=1: opt-in dashboard document-summary prototype linking to the library.
- /?view=documents: existing library remains unchanged by default.

Existing library links and downloads remain separate. Prototype stages are all
unconfirmed and have no progress value. Unfinished actions have explanatory empty
states rather than fake working buttons. Stage labels are proposed display text;
the reference's seven-stage/five-step crosswalk needs owner confirmation before
live release. Reading a client document does not authorize sending its data to AI.

## Next small step (pending)

The user clarified that no Google file is available yet. The intended real flow
is: admin selects a client (for example Golfbrands), assigns and publishes its
approved file, then that client sees it on the dashboard and can view/download it.
This matches the task. No real file or test-client assignment is assumed.
Obtain the approved test client/file or client-facing folder when the integration
step is reached; do not block the current layout prototype on that missing file. Inspect the existing Drive
connection privately and request user sign-in/consent through the portal if needed;
never request passwords/tokens in chat. Do not substitute a fake provider when a
real authenticated pilot is requested. No real account/folder has been selected,
no live Google request performed and no Development/Roeland alignment claimed.

Then implement and review client-to-folder mapping before moving to file
publication, protected retrieval and verified milestones in subsequent steps.
No broad automatic publication, editable duplicate files, payment inference or
upload-triggered stage advancement. Billing remains authoritative. Keep existing
AOC authentication, client permissions, resources and Hubstaff behavior intact.

No .env file or configured Neon database is changed. No migration is needed for
this presentation step. Push/merge remains with the user. Verification results
are recorded below after running checks; a UI-only preview cannot establish
Google permissions or authenticated download isolation.


## Automation clarification

The task requires reusing approved Drive files; it does not require uploading a
second copy through the admin portal. The planned setup assigns the client's
approved Drive location once. Published file references and verified released
versions can then be retrieved/synchronized automatically for the client dashboard.
Existing email delivery continues. An official approved-release signal must be
agreed before fully automatic publication; a newly discovered file alone is not
approval, a payment event or a journey milestone. Until the real folder and release
rule exist, the UI describes this plan explicitly as a prototype, with no simulated
sync provider or fake working download buttons. Source/client isolation checks and
Drive sign-in will be implemented in subsequent small steps, not claimed here.

## Step 1 checks

- Production build passes with private environment values shadowed and no database connection.
- All352 existing top-level Node tests pass.
- Six desktop/mobile component-preview scenarios pass. These prove layout, empty
  states, navigation targets and no attempted data/provider calls; they do not
  prove portal authentication, Drive permissions, file delivery or milestone accuracy.
- Changed-file lint passes. Full repository lint retains two existing
  react-hooks/set-state-in-effect errors in the unchanged Website Insights component.
  They are outside this small presentation step and were not modified.
- No migration, database write, Google request, real message or external coordination.


## Layout-only local review

- http://127.0.0.1:3116/?mode=admin : planned admin setup and release flow.
- http://127.0.0.1:3116/ : full client document/journey layout.
- http://127.0.0.1:3116/?mode=dashboard : dashboard summary layout.

This separate presentation preview does not impersonate a signed-in client and
has no authentication, database, Drive or payment connection. No client identity
or fake file is supplied. Existing protected portal routes still use their real
AOC/client login checks. The localhost preview process is temporary and can be
stopped independently. Mobile/desktop screenshots were inspected. Current copy
makes one-time folder assignment and no duplicate upload explicit.

This is a small prototype checkpoint, not completion of the document integration.
Next small step: implement admin client/location assignment, then connect the
approved real Google account/file when available. Stop before enabling automated
publication until the authoritative approved-release rule has been agreed.

## Step 2: functional AOC Admin reference setup (2026-11-19)

Implemented on `client-documents` in `C:\Users\MY PC\Desktop\AI\portal`,
building on Step 1 commit `ea77277`. The old AOC\chatkit checkout and its unrelated
edits remain separate. Final source lives in the project's actual app/components/
lib/database/scripts/tests/docs paths; ignored scratch files are not the feature.

### What now works

- `/admin/client-documents` uses the actual AOC Admin login and layout. Search
  existing clients, select one, paste an original Drive file/folder link, optionally
  label its related journey stage and save a short change reason.
- Saved references persist, can be edited and can be removed after confirmation.
  Recent admin history records changes. Unsaved form drafts are partitioned by
  client/record within the admin layout. The mobile form is a readable single column.
- Every record is clearly **Saved / Not published**. Saving/removing never uploads,
  edits or deletes Google files, changes payment state or advances journey stages.
- Actual API checks deny client, unrelated and Internal Portal accounts. Transactional
  writes recheck active admin/session authority, validate Origin/Host, bind edits
  to both client and record, reject stale revisions and mass assignment, enforce
  one active client assignment per Drive item and deduplicate exact retries.
- The additive, checksummed migration is explicit and repeatable. Missing storage
  shows a setup-needed state instead of pretending a save succeeded. No client
  publication/download API, automatic sync or Google grant is implied.

### Files

- `app/admin/client-documents/page.js`: functional admin setup; retained client
  prototype preview at `?preview=client`.
- `app/api/admin/client-document-assignments/route.js`,
  `lib/client-document-assignments.js`, `lib/client-document-assignment-policy.js`.
- `components/admin/client-document-assignments.js` and its CSS module.
- `database/client-document-assignments.sql`,
  `scripts/migrate-client-document-assignments.mjs`.
- `tests/client-document-assignment-policy.test.mjs`,
  `tests/client-document-assignments/{fixture,database.test,playwright.config}.mjs`,
  `tests/client-document-assignments/browser/assignments.spec.mjs` and README.
- Setup/progress/portability documentation, package script entries and a blank
  operator migration variable in `.env.example`. No private environment was copied.

### Actual verification

| Check | Result and limit |
| --- | --- |
| Production build | Passed with private `.env*` values shadowed, unreachable loopback database/provider configuration; no live data dependency. |
| Top-level Node regressions | 356 passed, including four new link/input-policy tests. Existing tests include controlled/mocked cases. |
| Internal Portal regressions | 115 passed using the existing Node test harness; not 115 live browser/provider checks. |
| Offline Drive / Hubstaff suites | 40 passed, zero failures/skips; no live provider verification. |
| Disposable PostgreSQL | Seven reported passing tests (parent plus six acceptance groups), real Better Auth sessions, separate operator/ordinary runtime roles. |
| Migration repeatability | Applied twice to fresh local WSL PostgreSQL 18; preexisting prerequisite table contents unchanged, no duplicate migration. |
| Authenticated browser | Seven desktop/mobile Chrome scenarios passed against actual built Next app, API and disposable PostgreSQL. External browser requests blocked. |
| Changed-file lint | Passed for all new/changed JavaScript and test files. |
| Full repository lint | Still fails on two preexisting `react-hooks/set-state-in-effect` errors in unchanged `components/portal/website-insights.js`, lines 80 and 87. |

Database cases cover persisted saves, retry deduplication, foreign selected-client
substitution, duplicate Drive ownership, unsafe/mass-assigned fields, Origin/Host
forgery, stale edits, operation-key substitution, revoked admin/expired session,
audited removal and lack of runtime audit UPDATE permission. Browser cases cover
save/reload, editing, client switching/draft partitioning, stale conflict display,
removal/history, direct page/API denial, revocation after login and 390px mobile
layout. Desktop/mobile screenshots were inspected.

The initial database test incorrectly tried to revive a session after Better Auth
had deleted it on expiry; it was corrected to sign in again. Two initial browser
assertions matched multiple valid elements; selectors were narrowed. The final
runs passed; no authorization check was weakened to accommodate the tests.

### Preservation and remaining setup

Only temporary generated automated-test identities and generic client fixtures were
written, on a fresh `aoc_documents_<random>` loopback database. Their credentials
were private/ignored, then removed with the test database. The isolated test server
was stopped afterward. No retained review login was created, per the user's choice
to use the existing AOC admin later. No Google API, real client, email, payment or
configured Neon write/read was required. No real Drive assignment was saved.

The migration does not update original client IDs or rows, conversations, files,
credit settings, resources, approved knowledge or indexing history. Disposable
checks compare unchanged client rows (including Hubstaff mapping/hours fields)
and migration prerequisite records. Offline regressions support preservation;
live AOC admin/Hubstaff/credits/AI workflows against real data were not exercised.

Before using the form with the existing admin, obtain approval for the intended
persistent database migration and set `CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL`
privately in an ignored operator setup file. Existing runtime `DATABASE_URL`,
`BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` remain unchanged. No new Google keys
are required for unverified reference storage. Detailed steps are in
`CLIENT_DOCUMENTS_SETUP.md`. The configured Neon database remains unmigrated and
untouched; this checkpoint does not authorize migrating it.

### Reference alignment and next small step

Recursive research read accessible linked journey/SOP material; private unavailable
references were excluded as instructed. It supports reusing original Drive files,
client-specific released documents and automated retrieval after an explicit
approved-release signal. It does not support publishing an entire client folder,
inferring payment from an upload, or granting AI access merely because a file is
downloadable. Seven-stage versus simplified document-step mapping still needs
confirmation before live journey progress is enabled. No coordination with other
Development owners has been represented as completed.

Use the existing AOC admin later at `/admin/client-documents` on the chosen portal
origin, after approved storage setup. The standalone port-3116 preview remains
layout-only if running; it is not this authenticated functional app. Next: verify
one approved real file/folder and account through Google sign-in when available,
then add explicit release and protected client retrieval in a separate increment.
Keep automatic publication and milestone advancement disabled meanwhile. No push.

## Step 3: functional releases and client journey (2026-11-20)

Built on `02e10f3` in the actual `AI\portal` checkout on `client-documents`.
The former opt-in journey preview is replaced on the client dashboard/Documents
view by a database-backed Documents & Journey component. Historical presentation
components/standalone tests remain in source, but no live portal route renders
them. The old `journeyPreview=1` flag is no longer needed.

### Implemented behavior

- AOC Admin retains the existing client picker/reference setup and now has a
  separate client-document Google connection, file review, explicit per-version
  approval/withdrawal, release/milestone audit history and verified journey editor.
- Google consent is real OAuth with read-only Drive plus openid/email, PKCE, an
  HttpOnly SameSite callback cookie, encrypted refresh token, account/session/config
  binding, one-time expiry and disconnect/reconnect event checks. There is no
  shared company-knowledge or Website Insights grant inheritance.
- A saved original file or direct client-facing folder is reviewed through Drive.
  Discovery does not publish files. Human approval records the exact source
  version, client-facing title/type and relevant journey stage for the client.
- Clients see their approved documents and saved journey on Documents, with a
  dashboard summary. Working view/download handlers retrieve original content;
  Docs/Sheets/Slides export to PDF, supported stored files retain their format.
  No duplicate editable document or persistent content cache is created.
- Client lists are paged, no-store and scoped to the resolved active membership.
  URLs contain no bearer grant/Google token/Drive ID. Copied links require current
  authentication and the same selected client. Viewer can read; client roles cannot
  publish. Internal users remain independently excluded.
- Delivery checks source ancestry, canDownload, approved version/name/type/date,
  assignment revision, connection generation/config and active publisher. Membership
  and release/connection checks run again after reading content, before bytes leave
  the server. Edits, reference changes, revocation, suspension, disconnect or
  reconnect prevent new deliveries. Files already downloaded cannot be recalled.
- Verified milestones are separate human records with seven confirmed names,
  current stage/completion, client-safe evidence and next action. A release or
  upload cannot advance the journey or confirm payment. Billing remains authoritative.
  Admin-only reasons are excluded from client output. Existing reference-library
  features remain available below, now labeled Additional references.

### Actual results

| Check | Result |
| --- | --- |
| Production build | Passed using isolated child environment; real `.env*` provider/database values shadowed and no live data dependency. |
| General Node regressions | 363 passed, zero failures/skips (seven additional delivery-policy tests). |
| Internal Portal suite | 115 passed, zero failures/skips in the existing controlled Node harness. |
| Offline Drive/Hubstaff suite | 40 passed, zero failures/skips; not live provider checks. |
| Setup database/API suite | 7 reported passing tests, including parent and six scenario groups. Real PostgreSQL/auth, no mocked portal authorization. |
| Release/milestone database/API suite | 10 reported passing tests, including parent and nine scenario groups. Real PostgreSQL/auth/API; Google transport explicitly mocked. |
| OAuth/Drive adapter suite | 5 reported passing tests, including parent and four scenario groups. Actual state/encryption/adapter code and SQL; OAuth identity/token and Google HTTP mocked. |
| Authenticated Chrome | 9 passed against the actual built project with disposable accounts/database. Includes admin journey save and assigned/foreign client views. Google connection is visibly disconnected; no fake connected provider UI. |
| Migration | Applied twice to fresh disposable WSL PostgreSQL 18, with a separate ordinary runtime role. Prerequisite table contents reconciled unchanged. Original 001 checksum/schema unchanged; new checksummed 002 additive migration. |
| Changed-file lint | Passed. |
| Full repository lint | Still the same two preexisting errors in unchanged `components/portal/website-insights.js`, lines 80 and 87. |

Browser screenshots of client journey and desktop/mobile admin forms were inspected.
The new approval and withdrawal/delivery paths have real API/SQL evidence with
mocked Google transport; a live connected-provider browser download is **not**
claimed. An ambiguous admin release-list SQL query and form accessible-label
issue were found by the browser checks and fixed. A disconnect race during first
OAuth connection was addressed with a durable connection-event binding, tested
alongside reconnect races. No authorization requirement was removed for tests.

The 22 reported database-test passes include three parent tests; there are 19
scenario groups. Do not describe these numbers as 22 live Google checks.

### Security and practical limits

- Dedicated server-side credential storage; deployment Google scope is read-only
  but broader than one folder. The server restricts retrieval to explicit client
  assignments/releases. Prefer a dedicated OAuth client so provider-side grant
  revocation is independent from company knowledge. Disconnect here removes local
  authority and does not globally revoke another OAuth use.
- One review checks at most 100 immediate folder entries, with an incomplete-result
  notice. Nested folders, shortcuts, internal/draft/restricted/archived-looking names
  and unsupported formats are excluded. Human review remains mandatory.
- **Whole-file release only.** A Google tab/heading URL is a selector within a
  document, not a separate permission boundary. Review the entire original and all
  tabs; the UI/confirmation explains this. No internal reference Doc is published
  just because its tab was linked. The portal does not edit original documents to
  add stage labels: approved source content and portal metadata must be aligned.
- Delivery is capped at 4 MiB to stay within Vercel's documented non-streaming
  response limit, with a bounded provider timeout. Larger-file handling is pending
  a separately verified delivery design. Native exports can fail if Google limits
  are exceeded. HTML/SVG/executable types are not exposed inline.
- Google revocation/moves/version changes are detected on file access. Previously
  approved titles may remain in a loaded list until refresh; there is no polling
  guarantee or instant recall of an in-flight/already downloaded response.
- Application authorization is the baseline boundary. The migration grants
  append-only audit access to an ordinary runtime but does not introduce RLS or
  protect against an already privileged database owner/login.
- No automatic Drive publication rule or external billing/milestone integration
  was invented. Approved originals are retrieved on demand. Existing emails are
  unchanged; the portal does not send messages in this step.

### Files and reproducibility

New runtime: `lib/document-{delivery,delivery-access,delivery-policy,drive}.js`,
`lib/client-document-categories.js`, admin `/api/admin/client-documents` and Google
callback routes, client `/api/client-documents` list/content routes, admin delivery
manager and client official-documents component/CSS. New document endpoints are excluded
from the debugger body-capture allowlist as private file surfaces. The new portable schema is
`database/client-document-delivery.sql`, applied through the existing explicit
`scripts/migrate-client-document-assignments.mjs`.

Existing admin/client page composition, reference form/CSS, library heading,
`.env.example`, setup/portability docs and scoped tests were extended. No new SDK
or dependency was installed. See `tests/client-document-assignments/README.md`
for guarded test commands and `CLIENT_DOCUMENTS_SETUP.md` for private configuration,
callback, migration, connection/rotation and review instructions. Scratch helpers,
private fixture accounts, generated content and logs are not shipped code.

### Preservation, setup and handoff

All database writes were to fresh `aoc_documents_<random>` loopback WSL databases
with generated temporary identities. Those databases/accounts and test servers
were destroyed/stopped. No retained review login was created. Existing AOC client
IDs, files, conversations, approved knowledge, resources, credits, indexing code
and Hubstaff mappings were not migrated or changed on real data. Local migration
checks and offline regressions support preservation; live workflows remain unrun.
Configured Neon, real messages/payments, Google sharing and private environment
files were untouched. No branch switch or push.

Private setup still required at the last format check:
`CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID`, `CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET`,
`CLIENT_DOCUMENTS_ENCRYPTION_KEY`, `CLIENT_DOCUMENTS_ALLOWED_EMAIL` in
`AI\portal\.env.local` (and the matching Vercel environment when approved).
Only names/status were checked; no values were printed. Set an approved operator
`CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL` privately in an ignored setup file and
confirm the database/runtime-role target before persistent DDL. No persistent
migration is authorized by this checkpoint. Existing runtime auth/DB values stay
private and unchanged.

The user supplied four reference tabs in Doc
`18w4a3t3PE-fvxyi-IVX5__LkooUMj_0xGwmuKEwd1_A`:
`t.po0mnw2awazg`, `t.0`, `t.ebr8nbyuihrx`, `t.r5uejtgwwgod`. These are requirements,
not an approved client-facing pilot file. A fresh explicit re-read was requested.
The connector currently reports a different account from the approved Jaymark
account; the user chose to reconnect `jaymark@alwaysopencommerce.co`. No document
read was performed through the other account. Fresh four-tab coverage remains
pending reconnection; prior research is recorded in Steps 1–2, not relabeled as
this fresh check. No real test client/file was assigned.

Resume: confirm the approved Google connector/account for reference review; finish
private document-provider setup; obtain the approved persistent migration target
and client-facing pilot file/client. After migration approval, sign in with the
existing AOC admin at `/admin/client-documents`, complete Google consent and review/
approve one real client file. Verify client `/?view=documents` view/download,
withdrawal and isolation using authorized test identities. Do not publish this
internal reference document or enable broad automatic publication.

## Approved Neon document activation (2026-11-20)

The user explicitly approved applying the document tables to the configured Neon
database after being asked about that target. This authorization supersedes the
earlier leave-Neon-untouched restriction **for this additive document migration
only**. No other feature, test fixture, client mutation or publication was authorized
or performed. Application source remains implementation commit `6107fae`.

### Completed and verified

- Verified the configured runtime/migration endpoint, actual database identity,
  role context, parent schema and schema/REFERENCES privileges privately. No
  connection string, credential, database name or account identifier was printed.
- Created an access-restricted, Windows-user DPAPI-encrypted backup of the full
  database schema plus any preexisting document-feature rows, and verified local
  decryption/readback before DDL. This is an affected-schema backup, **not** a
  full application-data backup or a provider restore rehearsal. Private artifacts:
  `.tmp/client-documents-neon-20261120-bd6f07eb07/`; excluded from Git.
- Applied the existing reviewed migration script with its confirmed database and
  runtime role plus the approved remote-target option. Both version records,
  `001_assignments` and `002_delivery`, match the committed SQL checksums.
- Verified all **nine document-feature tables** exist and are accessible through
  the actual runtime login. The eight feature-data tables are empty; only the
  two migration ledger rows were created. No client document was published.
- Compared all **52 preexisting table row counts** before/after: no changes.
  Compared the existing client-row content fingerprint: unchanged. No tests or
  synthetic identities were inserted into Neon. Existing conversations, files,
  memberships, credits, resources, knowledge and indexing records were not
  rewritten by this additive migration.
- The actual runtime retains its existing owner/elevated privileges, including
  audit UPDATE/DELETE capability through ownership. The migration did not promote
  any role, and append-only grants do not override owner bypass. Do not claim RLS
  or database-enforced immutable audit with this runtime login.

The first backup attempts stopped before DDL because the pooled Neon connection
rejects a startup `statement_timeout` option. Removing that backup-only startup
option allowed the read-only schema dump to succeed. TLS certificate validation
remained enabled. No application connection/env setting was changed.

### Pending activation steps

The private configuration check still reports these names missing/blank in
`AI\portal\.env.local`:

- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID`
- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET`
- `CLIENT_DOCUMENTS_ENCRYPTION_KEY`
- `CLIENT_DOCUMENTS_ALLOWED_EMAIL`

Configure them privately as described in `CLIENT_DOCUMENTS_SETUP.md`, register the
exact callback, and restart the portal. The existing authorized AOC admin can
then open `/admin/client-documents`, select a client and complete Google consent.
An approved client-facing file/client is still required for a live publication,
view/download and withdrawal check. The four reference-tab re-read remains
pending the approved Jaymark connector session; those reference links are not
client deliverable approval. No provider consent, live file read, client mutation,
message or payment was performed by this migration action. No push.

## Step 4: clear client journey and document discovery (2026-11-20)

User authorized the recommended next increment: five-step client presentation,
seven-stage admin mapping, document search/type/step filters and a dashboard
next-action card. Built on `26b0f96` in `AI\portal`, branch `client-documents`.
This step does not implement the later signature/approval or payment/email work.

### Reference review completed

Jaymark's connector session was verified and the supplied `ai commerce drafts`
folder was read without edits. Its 11 accessible documents were reviewed, including
all four tabs of the main journey guide. The prior pending fresh reference review
is therefore resolved; Google consent **inside the portal** remains independent.
The guide's 19 November crosswalk supplies the five-step presentation while
retaining seven internal stages and twelve checkpoints. References:

- Folder: https://drive.google.com/drive/folders/1isPW3TbqyVmII_hfa3iyVVDj57DqX-eQ
- Main crosswalk: https://docs.google.com/document/d/18w4a3t3PE-fvxyi-IVX5__LkooUMj_0xGwmuKEwd1_A/edit?tab=t.0

The source documents remain working/internal-review drafts. Their display mapping
is used here; their draft prices, commercial terms, messages and system access
are not automatically adopted. Nothing from that folder was published for a client.

### Changes

- Shared pure crosswalk maps internal 1/2→client 1 Get Started, 3→2 Share Your
  Process, 4→3 Review Your Plan, 5/6→4 Build & Test and 7→5 Launch & Handover.
  Saved internal state/evidence is unchanged. Unknown progress stays unconfirmed.
  A grouped step stays current until the internal stages in that group are passed.
- Client Documents and dashboard use the five-step wording; document entries show
  their applicable client step independently of current progress. Admin retains
  seven stages, sees a mapping table and sees both labels on release controls.
- Your next action is prominent on dashboard/Documents, using only the existing
  admin-recorded nextAction and date. An empty field says no action was recorded,
  not that nothing needs attention. Dashboard link opens the protected Documents
  view; no nonfunctional signature or payment buttons are added.
- Search approved document titles and filter by type/client step. Validation and
  parameterized SQL run after the existing client permission check. Filtering
  covers the full eligible client library before pagination; type/step/search
  combinations are supported, and SQL wildcard characters are escaped literally.
  Filter changes reset paging. Client/account switches unmount/clear prior data.
- Responsive layout and accessible labels/states retained. Dashboard summary is
  compact on desktop; mobile uses a single column. No browser storage, new
  credential, external provider call or dependency is introduced.

### Actual verification

| Check | Result and limits |
| --- | --- |
| General Node suite | 367 passed, zero failures/skips, including four crosswalk/filter-policy tests. |
| Setup database/API | 7 reported passes (parent plus six scenario groups), real temporary auth/PostgreSQL. |
| Delivery database/API | 11 reported passes (parent plus ten scenario groups). Added 53 synthetic release metadata records to verify >50 paging, older-document search, grouped step filters, literal wildcards/injection-like strings, type combinations and foreign-client denial. Fixture records cleaned up. Google transport mocked. |
| OAuth/Google adapter | 5 reported passes (parent plus four scenario groups); provider OAuth/HTTP mocked, SQL/state/authorization real. |
| Authenticated Chrome | 11 passed against the actual built Next app and disposable PostgreSQL: existing regressions plus five-step display/admin crosswalk, mobile filter requests/clear state, saved dashboard action/link and unrelated client fallback. |
| Internal Portal regressions | 115 passed, zero failures/skips in existing controlled Node harness. |
| Offline Drive/Hubstaff regressions | 40 passed, zero failures/skips; no live provider checks. |
| Changed-file lint | Passed. |
| Full repository lint | Existing two set-state-in-effect errors in unchanged Website Insights component (lines 80/87); no new reported errors. |
| Production build | Passed with all private .env values shadowed and unreachable loopback DB/provider defaults. |

Database tests report 23 passes including three parent tests (20 scenario groups),
not 23 live-provider checks. Browser checks exercise real auth/API/SQL and no
fake connected Google UI. Positive multi-page search results use synthetic
metadata in the database suite; a live Google-connected browser download remains
pending. Client desktop/mobile and dashboard screenshots were inspected.

### Preservation and remaining checks

No schema changes/migration are needed. Neon was not read or written in this
step; the previously approved Step 3 activation remains recorded separately.
No .env/credential change, real client publication, actual milestone update,
email/message, payment action or source-file edit occurred. Disposable local
databases/accounts and isolated verification servers were destroyed/stopped after
checks. IDs, seven-stage records, client permissions, existing download/revocation
checks, Hubstaff mappings, credits, resources, conversations, AI knowledge and
indexing paths were preserved. No Internal Portal behavior was changed.

Files: `lib/client-journey.js`, `lib/client-document-filters.js`,
`lib/document-delivery.js`, `app/api/client-documents/route.js`, the existing
admin delivery manager/CSS and client official-documents component/CSS,
`tests/client-journey.test.mjs`, extended document database/browser tests and
setup/progress documentation. Intended files live in real project paths, not
only the ignored task scratch directory.

Review after restarting the local portal: existing AOC admin at
`/admin/client-documents`, existing authorized client at `/?view=documents` and
its dashboard `/`. No new login was created for retained review. No extra
configuration is needed for this increment. The prior document Google settings,
portal sign-in/consent, approved client-facing pilot file and live provider checks
remain pending as documented; being connected as Jaymark in this assistant does
not authenticate the portal's separate OAuth grant. Do not publish this drafts
folder. Keep signature/acceptance capture, payment automation and email sending
outside this completed slice. Local commit only; no push.

Final cleanup: dedicated synthetic PostgreSQL cluster removed after verifying its
only non-template databases were postgres and the generated test database. Main
review server on port 3000 was preserved. Shared dates use an explicit locale and
UTC to keep server/client markup consistent across browser timezone settings.

## Vercel configuration handoff — 2026-11-23

Production and branch-scoped client-documents Preview environment imports were
completed for both the confirmed portal and Python projects. Config/Secret types
and targets were verified remotely. Node and Python passed read-only Supabase
TLS checks; an isolated production build passed and traced the public CA.
No migration, real-client test write, Neon access, local dotenv change, commit,
push or deployment occurred. Source changes: public CA files in both deployment
roots, Next tracing, deployment ignore protection and deployment documentation.
Preview backend automation access was subsequently explicitly approved and
configured. The portal Secret is scoped to client-documents Preview. Live checks:
unauthenticated Preview health redirects (302), the server credential reaches
health (200), and an unsigned ChatKit probe returns 503, Backend is not configured,
from the old deployment (private/no-store). Application authorization and working
chat must be checked after deploying the imported settings and public certificate
files. Vercel sign-in protection is preserved. No valid chat, database test write,
provider call or message was sent.
Current deployments still use their previous settings. See
[VERCEL_ENV_SETUP.md](VERCEL_ENV_SETUP.md) for exact pending checks and resume steps.

## Client-grouped document tables — 2026-11-23

Replaced the large client picker/empty landing block and document cards with
client-grouped tables. Client rows show name/account, portal access and a library
disclosure. Clicking anywhere on a summary row or its keyboard-accessible button
expands/collapses the client. Only the selected client's existing authorized API
data is loaded; switching/closing a group unmounts the previous client panel.

Within a group, rows show document title, publication visibility and updated date
(UTC). A row expands into description, original Google link, available file size
and Open attached file / Edit / Publish or Unpublish / Delete actions. The
existing review, reason, revision and idempotency checks remain in place. Delete
uses the existing archive command, retaining history and the original Drive file.
The add/edit form opens on demand and closes after a successful save. Existing
per-client draft preservation, quiet refresh and authorization-denial behavior
remain covered. The existing optional protected-delivery path is retained below.

Added client-name/account search; per-client document title/description search;
newest/oldest/title sorting; and published/private-draft filters. File-size sorts
work only for rows with supplied numeric byte metadata; unknown sizes sort last.
The current saved-link API supplies no verified sizes: those display Not provided
in expanded details and size sorting is disabled with an explanation. No Google
metadata fetch or guessed byte count was introduced. Tests supplying synthetic
size metadata demonstrate conditional UI behavior, not live provider support.
Search/sorting cover the existing latest-100 list; an explicit note appears when
100 records are returned. This step adds no global cross-client document search,
pagination, schema migration, environment setting or provider connection.

Actual results: 52 focused desktop/mobile fixture-browser checks passed, covering
the new disclosure/search/date/title/metadata-size/visibility behavior, delete
confirmation and existing publication, retry, revocation, saved drafts, screenshot
focus, stale-response and client-switching regressions. Changed source/tests lint
and git diff --check passed; isolated production build passed. Inspected desktop
and mobile screenshots of expanded tables and actions. Real-auth database browser
selectors were updated for the new navigation, but that disposable database suite
was not rerun in this presentation step. No live provider verification was run.

Changed source: components/admin/client-document-assignments.js and its CSS
module. Updated tests/admin-readiness/browser/{document-links,documents}.spec.mjs
and tests/client-document-assignments/browser/assignments.spec.mjs. Existing
Consolas configuration, server authorization, persistence, original client IDs,
document links and unrelated local changes were preserved. No database/provider
writes, real file deletion, dotenv changes, deployment, commit or push. Fixture
servers stopped automatically and the primary review server was left running.
Review the local /admin/client-documents route with an authorized AOC admin.

## Simpler sharing and real private uploads — 2026-11-23

Supersedes the nested-table interaction above. One client selector, an always
visible drag/drop or Drive-link form and direct row actions replace the multiple
expansion/add/publish steps. File names fill titles; descriptions are optional.
Save & share explicitly saves/publicizes a reviewed file or link in one action;
Save draft retains privacy. Existing link save operations remain private and
separate publish callers still require confirmation. One-step link sharing uses
the same locked transaction/audit receipt and retains legacy category/stage
metadata. Edit, Share/Unshare and Delete are visible without expanding rows.
Delete/Unshare confirmations remain, with automatic business audit reasons.

Added durable, bounded PostgreSQL file bytes and append-only upload audit, reusing
the application's portable storage/authorization pattern, not a provider SDK or
Vercel disk. New server-only routes create/update and preview admin files; the
existing authenticated client document list/download paths include shared uploads.
IDs, revisions, client scope, active membership and publisher state are rechecked;
bytes are not released on denial. Files are not sent to AI or external storage.
Size sorting now uses real uploaded-byte sizes; opaque Drive links stay unknown.
2 MiB per file; 100 MiB retained bytes per client and 30 uploads/client/creator/day.
Archive retains private bytes/audit, and future retention cleanup is not included.

Actual final verification:

- 407 offline Node tests passed; zero failures/skips.
- 58 desktop/mobile fixture-browser checks passed, including actual file-input
  and drag/drop UI, filename defaults, private drafts, missing setup, retries,
  direct actions, search/sort, client switching, screenshot focus and revoked
  access. API/provider responses in these browser checks were mocked.
- 39 reported real-auth/disposable PostgreSQL tests passed across assignments
  (7), links (9), uploaded files (7), protected Google delivery (11), Google
  adapter (5); these include five parent tests. Google transport was mocked.
  Both migrations ran twice on each fresh fixture database. The upload suite
  verifies exact byte persistence, concurrent replay, scope/revocation, old URL
  denial, inline/download headers, forbidden actors and browser-role SQL grants.
  A deliberately permissive browser-role default grant was revoked by migration.
- Changed-source/test lint, git diff --check and isolated production build passed.
- Desktop/mobile upload screens inspected. No live AI/Google/email/payment or
  real customer-file verification performed. Real-auth browser selectors were
  aligned, but that separate retained DB-browser suite was not rerun.

Additive upload migration applied to the approved Supabase target after rehearsal;
new tables/role grants and browser denial verified. Existing client/reference
counts unchanged and zero real uploads created. No Neon access, environment file
change, Git commit, push or deployment. New runtime configuration is not needed.
The primary review server remains available at /admin/client-documents. Existing
approved Google links, conversations, credits, resources, knowledge, indexing and
Internal Portal functionality remain on their existing paths.

Files: database/client-document-files.sql; scripts/migrate-client-document-files.mjs;
lib/client-document-file-policy.js; lib/client-document-files.js; existing link
policy/store and document-delivery.js; new admin file POST/GET routes; admin
document component/CSS; admin audit manifest; package script; pure, database and
browser tests; setup/portability/progress/UI documentation. All intended source
lives under actual project paths; ignored .tmp holds only scratch/private fixtures.

Remaining deployment work: publish/review the source and deploy Next.js with the
existing Supabase certificate packaging. Larger-file direct object storage,
antivirus scanning, retention purge, real customer-file/provider checks and the
previous Vercel AI/deployment checks remain outside this completed local slice.

Final follow-through: private/share checkbox choices are included in the
client-scoped draft, so switching clients cannot turn a private unfinished draft
into an automatically shared one. This case passed in the final 58-check browser
run. The final changed-source lint/build passed after that fix. All five generated
databases and the dedicated aoc_uploads cluster were verified and removed; the
existing WSL main cluster and primary portal review server were preserved.
No real customer files were added or downloaded during verification.


## 2026-11-23 — bounded bulk document uploads

Implemented on client-documents from43ae8d1. Existing local source was clean;
preserved unrelated branches and all private environments/review servers.

- Multi-file selection and drag/drop now open a client-specific queue of up to20
  files. Each retains its original2 MiB/type/storage limits. Titles default to
  filenames and are editable before an item starts. Existing description/share
  choices carry into the queue; visibility is explicit before upload.
- Files upload sequentially through the existing single-file protected endpoint.
  Per-file results distinguish saved, failed, invalid, unconfirmed and unstarted
  files. Retry keeps the exact operation ID/metadata and skips saved siblings.
  A partial result uses neutral feedback, not a misleading all-success notice.
- Stop-after-current, continue, selection removal/addition and safe client-switch
  teardown are implemented. Access/setup/quota errors stop remaining work; JSON
  and non-JSON authorization failures trigger a fresh access check and clear the
  document form. Pending File objects remain in memory only.
- Successful writes are independent and remain saved after failure/stop. This
  browser queue is not a durable server job: unsent files do not survive reload
  or closing. An in-flight save can complete for its original client after the
  browser leaves; switching never rebinds it to a different client.

Actual checks:78 desktop/mobile Chrome fixture checks passed (20 new bulk cases
plus58 existing document regressions);409 offline Node tests passed; changed
source/test ESLint and isolated full production build passed. Desktop/mobile
result screenshots inspected; git diff --check passed. Tests mock API responses,
including transactional receipt replay and ambiguous network results; they do not
claim a fresh live/storage database or Google-provider verification. The existing
file-policy/server tests pass in the offline suite. No actual customer upload,
database query/migration, provider request, environment change or deployment was
performed for this UI orchestration. No new configuration is needed.

Files: components/admin/document-bulk-upload.js; existing assignments component
and scoped CSS; lib/client-document-upload-queue.js; pure queue policy tests;
document-bulk browser suite and the single-file chooser label regression update;
setup/progress documentation. All application files are in the actual AI\portal
checkout. Ignored build/test artifacts stay out of Git. Existing auth, per-file
audit/storage/validation/client isolation, Drive links and single-file edits use
their unchanged working server paths. No commit or push was made for this task.
