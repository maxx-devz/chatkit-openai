# Client Documents and AI Commerce Journey

Branch: client-documents, created from master916bbf5 in AI\portal.

**Current checkpoint: Step 3 functional document delivery and saved journey state.**
Steps 1–2 below are historical. Live routes no longer render the prototype.
Google consent/live file verification and an approved persistent migration remain
pending; a local implementation pass is not a completed live rollout.

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
