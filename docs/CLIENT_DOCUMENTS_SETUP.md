# Document Library: private files and approved links

## Current workflow: upload a file or add a link (2026-11-23)

1. Open `/admin/client-documents` and select the client once.
2. Drop a file or choose **Choose files**. Select multiple files for a bulk
   queue (up to20 at once,2 MiB each), or select one for the existing single-file
   form. Filenames fill titles automatically. Alternatively, paste a Google
   Drive file link and title.
3. Description is optional. Leave **Share with the client when saved** checked
   and choose **Save & share**; uncheck it to save a private draft.
4. Existing rows expose Open/View-download, Edit, Share/Unshare and Delete
   directly. There is no need to expand a client or document to use the actions.
   Delete and Unshare require a short confirmation; audit reasons are recorded
   automatically rather than forcing repetitive text entry. Clicking a title
   optionally reveals its description. Search and date/title/size sorting remain.

### Bulk uploads

For multiple selected/dropped files, review or edit each title, remove unwanted
items, optionally add more files, and choose **Upload & share files** or
**Upload private drafts**. The existing optional description is applied to all
files in that batch. The selected client is fixed for its requests. No file is
uploaded until the upload button is pressed. Invalid/empty/oversized files show
their own explanation; valid siblings can still be saved.

The browser sends one bounded file request at a time to the existing protected
endpoint. Results and processed counts are per file; failed or unconfirmed items
can be retried without resending confirmed successes. Attempted titles/visibility
stay locked so each retry uses identical content and its original operation UUID.
Known access/setup/quota failures stop the remaining queue. Existing30-file daily
and100 MiB retained-client limits remain server-enforced;20 is only the per-batch
UI limit and does not grant a new storage allowance.

**Stop after current file** allows the current request to finish, then pauses
unstarted files. Retry/continue sends only remaining/failed items. Each file is a
separate transaction: successful uploads are kept when a sibling fails or the
queue is stopped. There is no claim of an atomic multi-file transaction.

Keep the page open. Reload/closing discards unsent browser File objects; these are
not placed in local/session storage. Switching clients aborts the active browser
request and stops subsequent requests; an already committed or in-flight save
can still finish for the original client. Recheck that client's library before
selecting the same files again after an interrupted page. No durable background
queue or automatic resume after closing the browser is introduced.

No schema, environment, storage provider or API-body limit change is needed.
Every file retains the existing server authorization, validation, quota, private
delivery and audit path. Real database checks from initial upload delivery remain
historical; the new bulk orchestration is verified with isolated API fixtures.

### Durable private files

Uploads use the existing PostgreSQL BYTEA storage pattern, in the dedicated
`portal_client_document_files` table; Vercel receives the request and accesses the
database. No file is stored on Vercel's temporary filesystem, exposed through
`public/`, sent to OpenAI, indexed into AI knowledge or placed in a public bucket.
No new storage provider, browser SDK, token or runtime environment variable is
required. The existing server-only DATABASE_URL is used.

Supported files: PDF, DOCX, XLSX, PPTX, UTF-8 TXT/CSV/Markdown, PNG, JPEG and WebP.
Each file is limited to **2 MiB**; larger files can use the existing Drive link
path. Server-side bounded reading checks actual bytes independently of browser
MIME. Type/signature/container checks are not a malware scan. Only PDF/images
are eligible for inline viewing; other types download as attachments. Responses
use private/no-store, nosniff, sandbox and same-origin resource headers, with
sanitized Content-Disposition filenames. There is no file-content execution.

Every file list, preview and download is authorized on the server. Client URLs
bind file ID, current revision and selected client. Membership, publisher status,
publication and archive state are rechecked before delivery. Unsharing, editing
or archiving invalidates old revision URLs; there are no reusable public signed
URLs. A file already downloaded cannot be recalled. Browser database roles have
no access to the file/audit tables; current runtime authorization remains the
application's existing service-role model, not new per-tenant RLS protection.

Uploaded files can be edited for title, description and sharing state. Replacing
bytes means adding a new upload. Retried requests use one operation ID; exact
replays do not duplicate files, and changed/cross-client replays conflict. File
mutations have an append-only audit receipt and use the existing admin request
audit wrapper; raw multipart bodies, document contents and credentials are not
logged. New-file quotas are 30 uploads per client/creator per rolling day and
100 MiB stored bytes per client. Delete is a portal archive: audit and stored
bytes remain private and count toward storage; later retention/purge is separate.

### Migration and activation

Versioned migration: `database/client-document-files.sql`, version
`003_private_uploads` in the existing document schema journal. Runner:

```powershell
npm run documents:files:migrate -- --confirm-database DATABASE_NAME --app-role RUNTIME_ROLE
```

Load the approved operator URL privately as
`CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL` in the operator shell. A remote target
also requires explicit approval and `--allow-remote`; never run fixtures against
a shared database. The runner validates database identity, checksum and an
ordinary runtime role, and grants access only to the new tables/sequence.
Conditional standard PostgreSQL REVOKEs cover `anon`/`authenticated` roles when
present, preventing managed-provider default browser grants from exposing bytes.

**Applied on 2026-11-23 to the previously approved Supabase project** after local
rehearsal. Runtime readability and browser-role denial were checked read-only.
Existing client and reference counts were unchanged; zero real uploads were
created during setup. Neon and local dotenv files were untouched. There is no
additional Google consent or storage-account setup for direct uploads.

The upload UI/code is local and has not been pushed or deployed. Deploy the
reviewed Next.js source with the existing public database certificate files.
No Python backend change is required for this document-upload feature.

Reference: [Vercel's default function body limits](https://vercel.com/docs/functions/limitations).
The 2 MiB application cap stays below the ordinary request/response limit and
does not require the optional larger-body beta or a plan/configuration change.

## Preserved Drive-link metadata behavior

The user explicitly removed journey/next-action presentation from both admin and
client document screens on 2026-11-23. Main fields are Document title, Description
(optional, 1,000 plain-text characters) and Google Drive file link. The client sees
shared titles/descriptions and open/download actions, plus simple title search.
There are no stage/type selectors, milestone editor, next-action card or journey
progress panels in this interface. Existing stored journey records and older
metadata/API behavior are preserved; this UI simplification deletes no history.

Description is client-facing metadata. It is saved in the existing append-only
assignment audit result for the exact client/assignment revision and is copied
forward into publication/unpublication receipts. Old records default to an empty
description. Legacy requests that omit description or stage preserve existing
values when editing. Drive-link metadata itself needs no additional schema or environment setting; direct uploads use the migration above.

## Default: publish an approved Google Drive link

This is the default flow as of 2026-11-23. It needs the existing portal database
and sign-in only; no CLIENT_DOCUMENTS_GOOGLE_* configuration, Google OAuth consent,
new schema migration, duplicate upload or provider call is required.

1. Sign in as an authorized AOC admin and open /admin/client-documents.
2. Select the client, add the original individual Google Drive/Docs/Sheets/Slides
   file link with a Document title and optional Description, then Save document.
3. In Saved references choose Publish link. Review the original file and its
   sharing, confirm it is appropriate for this client and Confirm publication.
   The portal records an audit reason for the submitted action automatically.
4. The badge changes from Private draft to Published to [client]. The authorized
   client sees it in /?view=documents and the dashboard document summary, with an
   Open in Google Drive action. Use Google's download option where permitted.
5. Unpublish link withdraws new portal opens. Editing or removing a reference
   invalidates its publication; edits need another explicit publication.

Existing saved links are never automatically published. Folder references remain
admin-only; publish individual approved files so a folder cannot expose unreviewed
contents. Publishing does not advance the independent verified journey, confirm a
payment, send email, or add document contents to AI knowledge.

### Access and limitations

The portal checks the current session, active membership/selected client, current
reference revision and the approving administrator's active status before listing
or redirecting. A copied portal URL does not grant client access. List/redirect
responses remain private/no-store and redirects suppress the portal referrer.
Only normalized HTTPS Google Drive/Docs file URLs are accepted. Title search applies before pagination across both delivery modes. Legacy API
metadata filters remain compatible but are no longer shown in the document UI.

Google controls the file itself. Share it with the intended recipient through
Google; publication does not change Google sharing. Anyone-with-link sharing allows
access outside this portal. Unpublishing cannot recall a copied Google URL, remove
Google sharing permissions, close an already-open Google page or remove downloaded
copies. The original is live: later edits within Google do not trigger reapproval.
This flow does not verify file content, file version, Google identity or download
availability through a provider API. Resource-key-dependent links are not supported
by the existing URL normalizer; use explicit recipient sharing. Exact-version,
server-delivered downloads remain an optional advanced integration below.

### Existing storage and audit contract

Link publication reuses portal_client_document_assignments and its append-only
portal_client_document_assignment_audit. An explicit publish command advances the
reference revision and writes its publication receipt in result JSONB in the same
transaction. Only a published_link receipt matching the current assignment ID,
client and revision is eligible. Category and approval time come from that receipt.
Save/edit/archive/revoke advance the revision, so old receipts and revision-bound
portal URLs immediately cease to authorize new opens. Historical receipts are
preserved. Exact retry operation IDs are idempotent. No new columns, tables, grants
or changes to applied migration checksums are introduced by this feature.

## Optional: protected downloads with a separate Google connection

The following historical setup applies only to the optional server-delivered,
version-approved download feature. It is not a prerequisite for the link library.

The current implementation provides actual admin reference setup, separate read-only
Google consent, per-file version approval/withdrawal, protected client viewing and
downloading, and saved seven-stage journey progress. Existing Step 1 presentation
files remain historical test fixtures; live routes no longer render them.

Admin: `/admin/client-documents`. Client: `/?view=documents`, with a summary on the
client dashboard. Existing AOC admin and client sign-in/permissions remain in use.

## Before using the save form with an existing admin

The existing admin login is unchanged. No retained review account was created.
On 2026-11-20, with the user’s explicit approval, both document migrations were
applied and verified on the configured Neon database. Existing client rows and
all 52 preexisting table counts were unchanged. This checkout no longer needs
that database migration repeated; continue with private Google setup below.

The following migration instructions are for another approved environment or a
fresh installation. They do not authorize changes to a different database.

1. Identify the approved database and its ordinary application login role.
   Back up the approved target before a persistent migration. This documentation
   is not approval to migrate the configured Neon database.
2. Privately set `CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL` in an ignored setup file,
   for example `.env.documents-setup`. This URL is used only by the migration
   operator. Do not copy it into a browser variable or paste it into chat.
3. Run from the project root, replacing the database and role identifiers:

   ```powershell
   node --env-file=.env.documents-setup scripts/migrate-client-document-assignments.mjs --confirm-database YOUR_APPROVED_DATABASE --app-role YOUR_RUNTIME_LOGIN_ROLE
   ```

   The script checks the database identity, applies a checksummed migration in a
   transaction and grants the runtime access to the new tables. The runtime gets
   SELECT/INSERT on audit records, without UPDATE/DELETE grants. The script can be
   repeated; it rejects changed contents for an already applied migration. Remote
   targets additionally require `--allow-remote` and a separate target approval.
   Do not add that flag just to bypass an unapproved target.
4. Keep the runtime's existing private `DATABASE_URL`, `BETTER_AUTH_URL` and
   `BETTER_AUTH_SECRET` configuration. The auth URL must match the address actually
   used in the browser, including localhost versus 127.0.0.1 and its port.
5. Start the portal normally on the approved environment, sign in with the
   existing AOC admin and open `/admin/client-documents`. No new permission or
   client assignment is automatically granted to that account.

## Connect Google for client document delivery

Configure these **server-only** names privately in this project's `.env.local`
and, when approved for deployment, the matching Vercel environment:

- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID`: OAuth web application client ID.
- `CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET`: matching OAuth client secret.
- `CLIENT_DOCUMENTS_ENCRYPTION_KEY`: stable randomly generated key, at least
  32 characters. Retain privately; do not replace it casually.
- `CLIENT_DOCUMENTS_ALLOWED_EMAIL`: the explicitly approved Google account.

Register the exact callback in Google Cloud:
`BETTER_AUTH_URL` + `/api/admin/client-documents/google/callback`. Localhost and
127.0.0.1, scheme and port must match the actual portal origin. Enable Drive API
and permit the approved test account in the OAuth consent configuration. The
configuration uses a dedicated grant/storage path, separate from the existing
company-knowledge and Website Insights connectors. Prefer a dedicated OAuth
client to make provider-side revocation independent as well.

After approved database setup, restart the portal and use your existing AOC admin:

1. Open `/admin/client-documents` and select the intended client.
2. Save the original approved file or dedicated client-facing folder link. No
   upload or editable duplicate is created. Saving alone does not publish it.
3. Choose **Connect Google Drive**. The user completes Google sign-in and consent.
   Requested scopes are `openid`, `email` and
   `https://www.googleapis.com/auth/drive.readonly`. Google's read-only scope is
   broader than one folder; the server enforces the selected file/direct-folder
   and explicit-release boundary. Nothing changes Google sharing settings.
4. Select the saved location and choose **Review files from Google**. Review the
   original, its client, exact version, client-facing title, document type and
   journey stage. Confirm the copy contains no internal/restricted information,
   then choose **Approve for client**. Only that file/version is published.
5. The assigned client signs in and opens Documents. Native Google Docs, Sheets
   and Slides are delivered as PDF; supported stored files keep their format.
   View is offered for PDF, PNG/JPEG/WebP and plain text; Office files download.
6. Use **Withdraw** with a reason to block future requests. Copies already saved
   by a recipient cannot be recalled. Publishing does not confirm payment.

Approval is for the **whole original file**, not an individual Google Docs tab or
heading. Query/fragment selectors are removed from saved references. Review all
tabs/content or use a separate approved client-facing original; tab-only delivery
is not implemented. Do not assign the internal journey reference document itself
as a client deliverable merely because one of its tabs was linked.

The portal retrieves approved originals automatically when opened. It does not
require uploading them twice and does not grant clients access to the whole Drive
folder. This release uses explicit human approval, not an unagreed automatic
publication rule. Existing email delivery is unchanged; this feature sends no email.

### Supported bounds

- Files/download exports are limited to **4 MiB** to stay below Vercel's documented
  4.5 MB non-streaming response bound. Larger delivery requires a separately
  designed and verified path. See [Vercel limits](https://vercel.com/docs/functions/limitations).
- A review reads at most 100 immediate folder entries. It excludes subfolders,
  shortcuts, restricted/draft/internal/archived-looking names and unsupported
  formats. It reports an incomplete review; narrow the folder or use a direct
  reference. Names alone are not publication approval: human review is mandatory.
- The client library pages through 50 approved releases at a time. File content is
  bounded and rechecked before response bytes leave the server. No signed bearer
  download URL, persistent document copy or provider token is returned to clients.
- Google access/version/ancestry are checked on opening a file, not by polling
  every browser list. A previously approved title can remain listed until the next
  refresh; provider revocation is detected on attempted delivery. There is no
  claim of instantaneous recall of an in-flight response or a downloaded copy.

### Journey progress and document filters

Admin keeps the **seven internal stages** in Update verified journey progress.
The editor shows the exact mapping to the client's five steps:

| Internal stage | Client-facing step |
| --- | --- |
| 1 Inquiry / fit and 2 Paid audit | 1 Get Started |
| 3 Discovery | 2 Share Your Process |
| 4 Audit / build decision | 3 Review Your Plan |
| 5 Implementation readiness and 6 Build / test | 4 Build & Test |
| 7 Release / handover | 5 Launch & Handover |

This mapping follows the Client Journey & Document Map's 19 November display
crosswalk. Existing seven-stage records, IDs, evidence and labels remain unchanged.
The client sees a completed step only after the saved internal stage has moved
beyond that group. Stage 5 alone does not complete Build & Test; stage 7 stays
current until the recorded whole-journey completion. No saved journey means
Unconfirmed, never assumed completion.

Use **Update verified journey progress** separately from document publication.
Confirm all seven internal names, select the current internal stage and record
verified milestone, approval or Billing evidence. The existing next-action field
now appears prominently as **Your next action** on the dashboard and Documents
page. Record a specific real client request; leave it blank if none is recorded.
The blank state does not claim that no work or approvals are outstanding.

The admin reason stays private. The client-safe summary and next action are
visible only to the authorized client workspace. The dashboard links to the
existing document library; it does not add a signing or approval action.

On the client's Documents page:

1. Search by the approved document title and press **Search documents** or Enter.
2. Choose **Document type** and/or **Journey step**; changing either applies the
   current search and resets to page 1.
3. Use **Clear filters** to restore all approved documents.
4. Use Previous/Next to browse the matching pages. Filters search the full eligible
   client library on the server, not just the loaded page. Titles are matched
   case-insensitively, and `%`, `_` and backslash are literal search characters.

Document entries display their mapped client step, independently of the client's
actual current progress. Admin release controls show both internal stage and client
step. Existing document authorization, exact-version checks and withdrawal behavior
are preserved. This update changes no database schema and requires no extra
environment variables or migration.

These are authorized human milestone records, not automated verification by
external Billing/project systems. Actual client signatures/acceptance, UAT, live
release decisions, payment events and email triggers remain separate work. Reading
or downloading a document does not record a decision.

### Reconnection and rotation

OAuth states are single-use, expiring, session/account/config bound and protected
with PKCE and an HttpOnly SameSite=Lax callback cookie. The callback rechecks live
admin/session authority and the connection event/version after token exchange.
Wrong account, missing scope, replay and disconnect/reconnect races are rejected.
Refresh tokens are AES-256-GCM encrypted with owner, connection generation and
configuration as associated data; they never enter UI responses or logs.

Disconnect removes local credentials/pending states and immediately excludes the
old generation from new deliveries. It intentionally does not revoke the Google
app globally, which could affect another grant if an OAuth client was reused.
Remove the app in Google account permissions for provider-side revocation when
appropriate. Reconnecting creates a new generation: re-review and approve releases
again. Changing the OAuth client, allowed account or callback also invalidates the
configuration binding. For encryption-key rotation, disconnect, replace the key
privately, reconnect and reapprove; maintain a private rollback/backup plan. No
production rotation or Google revoke was performed by this development step.

## Boundaries and preservation

- The new route uses existing Better Auth/AOC Admin authorization and independent
  Internal Portal exclusion. Every API request checks the current account. Writes
  lock/recheck the active administrator and live auth session in the transaction.
- Client IDs come from existing clients. Editing/removal queries bind both the
  record ID and selected client; a record cannot be transferred by changing a
  request field. One active Drive item can belong to one client in this feature.
- Only direct HTTPS Drive/Docs/Sheets/Slides links are accepted. Account/query
  parameters are removed; saving a canonical URL is not Google access validation.
- Each mutation requires a reason, a retry key and the current record revision.
  Stale edits conflict. Exact retries do not add duplicate records/audit entries.
- Lists, errors and responses use private/no-store headers. Client/Internal/unrelated
  accounts cannot enumerate admin data. Client list/download handlers independently
  resolve the active membership and bind the selected client, release, reference
  revision and credential generation. The legacy library remains separate.
- Existing client rows, Hubstaff fields, library files, conversations, resources,
  credit tables and indexing code are not altered by the feature migration.
- These tables use the baseline application's server authorization model. This
  step does **not** add tenant RLS or protect against a privileged database login.

## Local verification

See `tests/client-document-assignments/README.md` for the guarded database/browser
checks. Database/API/browser verification used temporary generated identities on
a fresh WSL PostgreSQL 18 database, with an ordinary runtime role and separate
operator role. Google/OAuth responses in deterministic tests are explicitly mocked. No live
Google calls, real emails, real client changes or live billing were involved. Test accounts/database were destroyed after verification.

The separate layout-only server on port 3116, if still running, remains Step 1's
unauthenticated presentation preview. It does not demonstrate persistence or
Google access; review the functional route through the actual protected portal.

## Stable editing and refreshing - 2026-11-23

The admin reference setup loads when a client is selected, after saving/removing a
reference, or when the administrator chooses **Refresh references**. Returning to
the browser tab or closing a native select popup no longer triggers a reload.
Refreshes keep the existing reference and journey forms mounted. Transient refresh
failures disclose that references may be out of date and preserve unsaved inputs;
401/403/404 responses clear the previously displayed client content. Only the
latest request for the selected client may update the screen. Client switching
still uses separate keyed state and never reuses another client's reference list.

## Vercel deployment checkpoint — 2026-11-23

See [VERCEL_ENV_SETUP.md](VERCEL_ENV_SETUP.md) for the saved Production and
client-documents Preview configuration, public certificate packaging, pending
Preview backend authorization and deployment sequence. The approved-link library
does not require the optional Client Documents Google OAuth variables.


## Approved private Supabase Storage adapter — 2026-11-23

The user explicitly selected private Supabase Storage for larger client documents.
This is a separate storage architecture decision, not a move to Supabase Auth or
browser database queries. Existing BYTEA files, IDs, conversations, credits, Drive
links and Better Auth remain intact. New optional metadata/audit tables use portable
PostgreSQL; object bytes, signed upload tokens and TUS depend on Supabase Storage.
Moving those objects to another provider would require a separate export/adapter.

The previous 2 MiB value remains only on the legacy multipart/BYTEA transport.
The document picker and new direct Storage path have no portal per-file size cap.
The Supabase project plan, global upload limits, storage capacity, network and the
server's 300-second validation deadline still bound successful uploads. This is
not physically unlimited storage. No plan, billing or global provider limit was changed.
Bulk upload remains 20 files per selection and the direct path limits 30 prepared
uploads per client/admin per day, including pending attempts, to bound abuse.

Native browser TUS transfers files above 6 MiB in 6 MiB chunks; smaller files use
an object-scoped signed PUT. Retry state stays in memory in the current tab, never
localStorage. Refreshing may restart the transfer. Successful metadata/receipts are
idempotent and stay saved. Each upload receives a generated, immutable private path.
The service key never goes to the browser; only a one-object upload token does.

The server streams and hashes the complete object before marking it ready or
sharing it, checks size/version and repeats current administrator/session checks
before committing. File type validation uses an explicit extension allowlist,
signature checks and incremental UTF-8 checking. It is not an antivirus scanner
or full Office/ZIP parser. .exe, installers, unknown extensions and known executable
signatures are blocked. Source files including HTML, CSS, JavaScript, Python, PHP,
Liquid and JSON are data; Storage downloads are always attachments. Google native
cloud files should normally use a Drive link or an Office/PDF export. .gdoc/.gsheet
shortcuts are stored only as text and are not automatically followed or converted.

### Private configuration and activation

Set privately in `.env.local`, then in the matching Vercel server environment:

- `CLIENT_DOCUMENTS_SUPABASE_URL`: the approved Supabase project URL.
- `CLIENT_DOCUMENTS_STORAGE_BUCKET`: `client-documents-private`.
- `CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY`: a server secret (`sb_secret_...`) or
  legacy `service_role` JWT from Settings → API Keys. Not a publishable/anon key.

Never use NEXT_PUBLIC for the service key. Do not paste credentials in tickets,
chat, screenshots or Git. No additional package or Google OAuth setup is required.
Create a **private** bucket with that exact name through Supabase Storage; leave
bucket-specific file size/MIME restrictions unset if the project's global limits
and the portal allowlist should govern uploads. Do not change the plan/global limits.

The reviewed operator applies `004_private_object_storage` using the separate
private `CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL`. The runtime stays an ordinary
non-owner role. Example (placeholders, never connection values):

```sh
npm run documents:storage:migrate -- --confirm-database APPROVED_DATABASE --app-role ORDINARY_RUNTIME_ROLE --allow-remote --supabase-policy
```

For disposable localhost omit `--allow-remote`. The existing 003 upload migration
is a prerequisite. The operator also needs ownership/approved policy-management
authority on `storage.objects` for `--supabase-policy`; ordinary app credentials
must not receive that authority. A permission error rolls back this transaction.
Use a privileged SQL Editor session only to run the reviewed, version-controlled
`database/client-document-storage-supabase.sql` with its bucket setting, then rerun
the metadata migration with an approved operator. Do not rewrite existing schemas.

The bucket policy is restrictive for all ordinary roles and defeats other broad
permissive policies for this bucket, leaving unrelated buckets unchanged. Runtime
preparation and download authorization fail closed if that policy or RLS is missing.
Service-role credentials intentionally bypass Storage RLS and remain server-only;
this is not tenant RLS for the portal's metadata tables. Each portal request uses
existing Better Auth/client permissions and live client-bound queries.

New private downloads require current membership, selected client, revision and
active publisher, then receive an attachment grant valid for **30 seconds**.
Unsharing/removal/revocation stops new grants. A copied provider grant can still
work until expiry, and a download started earlier may finish afterward. One-object
upload tokens can remain usable for the provider's **two-hour** lifetime after an
admin loses access, but cannot finalize/publish without fresh portal authorization.
They cannot overwrite an existing object. These are residual windows, not instant
revocation. Archiving hides metadata and preserves audit; it does not delete bytes.
Interrupted/invalid uploads can leave private pending objects. Automatic retention
cleanup, malware scanning, deployment/CDN behavior and live provider limits need
separate operational validation; no cleanup worker is implied.

### Verification for this change

- Passed: 413 offline tests, 7 synthetic provider/transfer tests, focused lint,
  isolated production build, 84 real Chrome desktop/mobile component checks.
- Disposable PostgreSQL 18: both migrations applied twice, 48 database/API checks
  across assignments, approved links, legacy uploads, Storage, protected delivery
  and mocked Google adapters. Actual ordinary app role and real Better Auth used.
- Storage database checks include same-user workspace switching, forged client IDs,
  revoked membership/admin, concurrent exact retries, stale revisions, private
  downloads, invalid bytes and restrictive policies despite broad browser grants.
- Providers are mocked in all automated suites. Browser APIs are intercepted;
  this does not establish live Supabase/TUS, Google sharing or deployed CDN behavior.
- A fixture role-grant/table-name setup failure was corrected. One concurrent
  response-body read failure occurred during development; it did not recur on the
  subsequent fresh run with 16 extra concurrent replay reads. Keep it recorded
  rather than calling repeated failure-free production operation established.
- Approved Supabase activation (2026-11-23): applied version 004 and the
  bucket-scoped restrictive policy with the private operator, preserving all
  existing clients, memberships, assignment/file rows and audit counts. New object
  metadata rows remain zero. Supabase's delegated policy management permits this
  without changing storage table ownership or elevating the runtime role.
- Live activation completed 2026-11-25 after the user privately replaced the
  publishable key with a server secret. Created `client-documents-private` with
  `public=false`, no bucket-specific file-size or MIME cap; project limits remain.
  The already-applied 004 migration and restrictive policy were verified through
  the ordinary runtime path. Existing record counts were unchanged by activation.
- Actual provider checks passed: a 3,145,785-byte synthetic JavaScript file used
  the real signed PUT, full streaming validation, denied public retrieval and a
  working signed attachment download. A 7 MiB synthetic source used the actual
  browser transfer helper against live Supabase TUS (POST 201, 6 MiB + 1 MiB PATCH
  204), then full server-side validation. Portal prepare/complete metadata responses
  were mocked in that TUS test; no real customer metadata was inserted or published.
- Live testing found and corrected the signed TUS endpoint: it must be
  `/storage/v1/upload/resumable/sign`, not the ordinary authenticated endpoint.
  The existing one-object token remains in x-signature; no service key is sent
  to the browser. Updated unit/browser fixtures now enforce that signed path.
- All temporary provider objects were removed. Read-only verification confirmed
  zero remaining `verification/` objects and zero customer object-metadata rows;
  existing clients, memberships, links, legacy uploads and audit counts matched
  the preflight. No real client document was uploaded, edited or published.
- Current focused lint, 7 provider/transfer fixture tests and the isolated
  production build passed. The browser rerun passed 83/84: one touch scenario
  timed out during its initial mocked client-list load, before upload actions.
  The affected authorization scenario subsequently passed six independent runs
  (three desktop and three touch), with no application change. The initial timeout
  remains recorded as a browser fixture flake; it was not a successful full rerun.
  All six new Storage browser cases passed.
- Still pending: a user walkthrough with an existing authorized account, deployed
  Vercel environment/redeployment and live browser-to-provider CORS/CDN behavior.
  Live TUS was exercised through the real client helper under Node, while browser
  API/provider traffic remained intercepted. No deployment or Vercel variables
  were changed. Privately add the three Storage settings to the intended Vercel
  environments before release. Restart local dev after private env changes.
  No global plan setting or Neon data was changed. Credentials were not printed,
  committed or pushed.


## Selected retries and bulk library deletion — 2026-11-25

The upload queue now has per-file selection, Select all pending files, Select
failed files and Retry this file. Retry selected files submits only eligible checked
rows; saved and invalid entries cannot be selected. Saved uploads are never resent.
Exact retries retain the existing operation UUID and frozen metadata, including
an unconfirmed response, so the server can deduplicate them. A file rejected for
invalid content still needs a corrected source; retrying cannot repair its bytes.
Queued files and retry selection remain memory-only and client-bound.

The library has row checkboxes, Select shown documents, Clear selection and a red
Delete selected control. One confirmation identifies the count and selected client.
Filtering clears hidden selections; changing clients destroys the old selection
and aborts its current browser request. Requests already committed may still finish
for the original client. No remaining requests are started after unmount.

Bulk delete calls the existing archive endpoint separately for each selected link,
legacy BYTEA file or private Storage file. Every call retains its current client,
revision, authorization, audit and operation receipt. Failed rows remain selected;
confirmed deletions disappear and are not repeated. Unknown outcomes reuse their
original operation on retry. Access denial stops further writes and clears data;
stale revision/setup/throttling conflicts stop the batch for review. Per-request
timeouts are bounded and non-JSON authorization errors preserve their HTTP status.
This is portal removal/archival, not permanent object erasure: original Drive files,
retained upload bytes and audit records stay intact. Existing signed-download
expiry behavior remains as documented above.

Files: components/admin/document-bulk-upload.js, document-library-table.js,
client-document-assignments.js and its CSS; browser document-bulk.spec.mjs and
document-bulk-delete.spec.mjs. No new schema, environment variable or provider
permission is required. Existing local edits were retained; nothing was pushed.

Actual validation: 36 selected-retry/bulk-delete desktop/mobile Chrome cases plus
64 affected document regressions passed (100 total); 413 offline tests, focused
lint, git diff --check and an isolated production build passed. Desktop/mobile
screenshots were inspected. Browser fixtures intercept all provider/API requests;
no real customer document was deleted and no remote DB migration was run for this
UI change. Prior database and live Storage evidence remains separate above.
User review on /admin/client-documents and deployed verification remain pending.


## Empty-library clarity after deletion — 2026-11-25

The user confirmed that the empty table after successful bulk deletion looked
stuck. Replaced the blank headers/disabled delete strip with a clear folder icon,
Library is empty heading, completion/first-use explanation and Add a document link
back to the working form. A filter with no matches has a separate Clear search
state, so it cannot be mistaken for deleting the whole library. Existing refresh,
permissions, archive behavior and persisted records are unchanged.

Actual checks: 42 desktop/mobile Chrome upload/delete cases passed, including
deleting all entries, opening the file picker afterward, first-use emptiness and
clearing a no-match filter. Focused lint and an isolated production build passed;
the desktop screenshot was inspected. API/provider calls in these browser checks
are intercepted fixtures. No database migration, real-client write, Storage change,
credential change, commit or push was performed for this presentation fix.


## Misnamed JPEG/WebP and pending-object retry fix — 2026-11-25

Inspected the reported local flooding-cropped.jpeg header without displaying its
contents or uploading it. Its actual content is WebP (159,958 bytes). The old
strict suffix check rejected it. A pending object could remain in private Storage,
then a retry tried to issue a fresh upload grant for the already-existing path,
producing a generic provider error rather than completing validation.

Supported raster extensions now detect JPEG, PNG, GIF or WebP from content and
store the corresponding MIME/filename. Genuine .jpg/.jpeg keep their names.
A mismatched raster suffix is normalized (this example becomes .webp); bytes are
not converted, the local original stays unchanged, and custom document titles
are preserved. Filename-derived default titles follow the corrected filename.
Unknown formats, executable headers, SVG/HTML disguised as raster and other
non-image content remain blocked. This is header validation, not malware scanning.

For a pending upload, the server probes only its trusted existing object path and
expected size. If present, the prepare response skips a second transfer and the
completion path still streams/hashes the entire file and repeats live authorization
before saving/publishing. Missing objects still get a one-object upload grant;
recognized provider missing responses and a concurrent-completion race are handled.
No overwrite, new object, new retry UUID, cross-client lookup or new permission is
needed to recover a previously transferred valid image. Changed size is rejected.
The original operation/actor/client and audit deduplication rules remain intact.

Actual verification: the reported local file now validates as image/webp and
flooding-cropped.webp, with no local file change. 415 offline checks, 10 provider/
transfer fixtures, 42 desktop/mobile upload browser checks, focused lint and an
isolated production build passed. 49 real database/API checks passed on disposable
WSL PostgreSQL with synthetic accounts and mocked providers. Two earlier runs lost
the legacy delivery connection when WSL idled/shut down; a foreground WSL keeper
allowed the fresh full run to complete. The keeper is task-only, not app code.

A live approved Storage check used a generated two-pixel WebP with a .jpeg name:
first signed upload, existing-object retry, corrected MIME/filename and full
validation passed; the synthetic object was deleted afterward. No real customer
image was uploaded or published by these tests. No schema migration, environment
change, Neon access, commit or push was needed. User review should choose Retry
this file (or only that selected row) in the existing failed queue; saved siblings
are not resent. If the queue has been closed, the original file can be selected
again without manually renaming it. Deployment verification remains separate.


## On-demand image and PDF previews - 2026-11-25

In the Admin Document Library, an uploaded PNG, JPEG, WebP, GIF or PDF now has a
Preview button. Opening the document title also expands its preview; Hide preview
collapses it. Images fit within the row; PDFs use the browser's native viewer.
Open full preview and the existing View / download action remain available.
Unsupported formats and Drive links keep their existing download/open behavior;
SVG, HTML and source code never become executable inline previews.

Preview loads only on expansion, and switching clients removes it. PDFs first
check a same-origin, no-store one-byte range so expired access gives a useful
retry message instead of displaying an HTTP error inside the PDF viewer. This
request is cancelled when its component closes. The viewer may issue further
byte-range requests. Development React effect replay can repeat the read-only
probe; it does not save, publish or duplicate a document.

Private Supabase bytes stream through the existing authenticated delivery route.
Each request checks current client membership/admin authority, selected client,
ready/unarchived metadata, revision, private bucket policy and trusted object
location. Access is checked again after provider headers, before returning bytes.
Ranges are single, bounded and verified against metadata size/provider headers.
Responses use private/no-store, nosniff, same-origin resource policy and sanitized
inline filenames. No service key or public/signed preview URL reaches the UI.
The legacy BYTEA path also supports these safe preview types. Inline safe files
have a restrictive default-src/base-uri/form-action/frame-ancestors CSP; downloads
of other content retain their sandbox policy. A CSP sandbox on native PDF responses
was removed because it prevents the browser PDF extension from starting.

New requests fail after unsharing, membership/publisher revocation, archival or a
revision change. Already delivered preview bytes cannot be recalled. Ordinary
Storage downloads retain their separate 30-second attachment-grant window.
The client library UI is unchanged by this Admin preview addition.

No migration, new environment variable, auth migration or provider SDK is needed.
The configured private Storage variables and existing metadata migrations remain
the prerequisites. No real customer file or database record was changed for this
preview work; Neon remains untouched. User review and deployed behavior remain
separate from local checks.

Actual preview verification: 419 offline tests passed, including four new preview
policy checks; all 11 deterministic provider/transfer tests passed. The eight new
desktop/touch preview browser cases and 108 existing document browser regressions
passed. These browser APIs use intercepted fixtures; Chrome's actual PDF extension
reported successful document loading, not just iframe visibility. Headless PDF
screenshots do not reliably capture the plugin surface, and other browser engines
and a user review of real PDFs remain pending.

50 database/API checks passed on fresh disposable WSL PostgreSQL using ordinary
runtime credentials, synthetic accounts and mocked providers. Initial test runs
identified a duplicate mode parameter in the test URL and an outdated sandbox
assertion; both were corrected. PDF browser assertions also account for React
development effect replay. An overlapping browser-run attempt encountered the
shared test port; final suites ran sequentially and passed.

A separate approved live Storage transport check uploaded only a generated tiny
PDF-header fixture, verified full reads and bytes=0-3 partial reads through the
new provider function, then removed that exact object. It tested transport, not
real customer PDF rendering or live portal login. The dedicated disposable WSL
cluster and its four synthetic rehearsal databases were removed afterward; the
existing main cluster was preserved. Focused lint, git diff --check and an
isolated production build passed. No commit or push was performed.


## Document form layout refresh - 2026-11-25

The Admin add/edit form now uses a white card with an icon/header, client context,
a dedicated upload area beside the document details, and a separate visibility/save
footer. Supported-format guidance is expandable rather than filling the dropzone.
The existing automatic filename title, Google link alternative, optional description,
drag/drop, multi-file selection and edit/cancel behavior are preserved. Private-draft
copy follows the sharing checkbox. Mobile stacks the form and makes Save full width.
The existing portal font, routes, draft preservation, validation, permissions and
upload/preview/delete handlers remain in use. No new network calls, dependencies,
environment settings or database changes are introduced by the layout refresh.

Verification of the refreshed form: all 108 existing desktop/touch document cases
and eight preview cases passed using actual components and intercepted synthetic
APIs. Desktop and 390px mobile screenshots were inspected; the upload test also
checks for horizontal overflow. Focused lint, git diff --check and an isolated
production build passed. No new test-only application path was introduced, and no
real database/provider writes were made for this visual change. User review and
deployed verification remain pending. Existing local edits were preserved; no
commit or push was performed.


## Permanent uploaded-file deletion and original filenames - 2026-11-25

This supersedes earlier archive-only byte-retention descriptions. The user asked
for actual Storage deletion and human filenames. New uploaded objects now use
clients/<client-id>/<unique-document-id>/<original-filename>; the UUID folder
prevents same-name uploads from overwriting each other. Ordinary ASCII filenames,
spaces and punctuation supported by the adapter are preserved; unsupported Unicode
is normalized to an ASCII-safe object key. The original/validated filename remains
in portal metadata and download disposition. A portal title is separate from the
original filename. Editing title, description or sharing changes the Supabase
PostgreSQL metadata; it does not create another file or rename it to an arbitrary
display title. Sharing/unsharing retains the file. Drive-link deletion removes only
the portal link and never edits/deletes its Google original.

Delete now commits revocation/archive plus a durable cleanup receipt, then removes
the exact uploaded object using the private Storage API and verifies its absence.
It retains the metadata, hash and audit history. The receipt is needed because a
PostgreSQL transaction and a remote object operation cannot commit atomically.
Failed removal is visible as Retry storage cleanup on that client's screen; bulk
deletion also reports pending physical cleanup. A repeated delete receipt safely
retries cleanup without another archive or audit entry. Legacy BYTEA uploads clear
their archived content while preserving audit/metadata; migration 005 changes only
the archived-row size constraint, leaving active file validation in place.

The worker checks configured origin/bucket, the exact client/document folder and
current metadata before removal, protects currently active paths, uses row locks
with SKIP LOCKED and handles bounded batches/backoff. Expired abandoned upload
attempts are rejected and queued. This is not a bucket-wide delete and never infers
that an unknown object belongs to a client. Raw provider failures, keys, file bytes
and signed grants stay out of diagnostic responses/logs.

Upload grant expiry is recorded before external issuance and checked under a row
lock before granting. Supabase resumable sessions may last 24 hours, so automatic
abandonment and final cleanup conservatively include that window in addition to
the two-hour scoped-token window and five-minute margin. Already deleted/retired
paths are rechecked every five minutes until the final deadline, removing possible
late completions. Portal revocation is immediate for new reads; bytes already
delivered cannot be recalled, and existing attachment grants retain their earlier
documented residual window. Provider reference:
https://supabase.com/docs/guides/storage/uploads/resumable-uploads
Object deletion must use Storage API, not its catalog SQL:
https://supabase.com/docs/guides/storage/management/delete-objects

Apply `npm run documents:storage:lifecycle:migrate -- --confirm-database <name>
--app-role <ordinary-role>` with CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL privately
set, plus --allow-remote only for the approved target. No new credentials are
required. Runtime still needs DATABASE_URL and CLIENT_DOCUMENTS_SUPABASE_URL,
CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY and CLIENT_DOCUMENTS_STORAGE_BUCKET, privately
in .env.local / matching server environment. Do not paste their values into chat.
The server service key is never exposed to the browser.

New `npm run dev` processes start the independent cleanup watcher automatically
when these Storage settings are present; its failure never stops Next/Python.
Restart an already-running development launcher to pick up the new watcher.
`npm run documents:storage:cleanup` performs one bounded pass with privately loaded
runtime settings; append -- --watch for a worker. Production needs a separately
configured scheduler for /api/cron/client-document-cleanup, using existing
SOURCE_SYNC_SECRET or CRON_SECRET as a 32+ character bearer secret. No scheduler
or deployment was configured by this task. Configure it privately before relying
on unattended production retries or expired-upload cleanup.

For old document.ext objects, `npm run documents:storage:reconcile --
--confirm-database <name> --client <id> --rename` is a read-only dry run. Applying
requires --apply --actor <approved-active-AOC-admin-user-id>, plus --allow-remote
for an explicitly approved target. Use the private runtime credentials, not an
elevated application login. It copies into the deterministic human-name path,
checks the full content hash, commits the pointer/audit and queues the old key for
removal. IDs, revision and public portal URLs remain stable. Rerunning recovers
a completed copy whose DB transaction was interrupted. If a destination hash
differs, it stops without adopting or overwriting it. Explicit --discard-upload
<id> is reserved for operator-reviewed abandoned attempts in that same client;
it rejects their completion and schedules byte deletion. Never use it for a
current upload. Deleted bytes cannot be restored from metadata/audit alone.


Actual approved reconciliation: read-only inventory of gogrit (client 1) found two
active objects, two archived objects and two abandoned flooding-cropped.jpeg
attempts from the previously reported failures. Version 005 was rehearsed twice
on disposable PostgreSQL, then applied to the approved Supabase project only.
A dry run reported two planned renames and two explicitly selected abandoned
attempts. The scoped apply renamed both active keys, rejected those two failed
attempts, removed six obsolete keys (four unwanted objects plus two old keys of
the retained files), and cleared bytes from three already-archived legacy rows.
The active customer file bytes were copied only within the existing private
Supabase bucket, fully hash-checked, and their old copies removed. No document was
sent to AI or Google. No Neon database was read or modified. No environment file
or private credential was changed.

A subsequent read-only DB/Storage traversal verified exactly two objects under
clients/1: CWR Xmas 02 - 2026.png and video.jpg. Both original document IDs,
revisions and content hashes remained valid; there were zero unreferenced objects
in that client prefix. Audit/metadata history is retained, with two append-only
storage-rename entries. Six durable follow-up receipts remain for old upload
sessions; they contain no retained file bytes. Historical archives in other
clients were not purged: historical backfill requires an explicitly selected
client in the admin cleanup request or guarded reconciliation command.

Verification: 421 offline tests and 13 deterministic provider/transfer tests passed.
54 database/API checks passed against disposable WSL PostgreSQL with synthetic
accounts, ordinary runtime credentials and mocked providers. This includes cleanup
retry after initial and later failures, signed-upload late-completion rechecks,
concurrent worker locking, copied-but-uncommitted rename recovery, unchanged IDs,
foreign-client denial and cron-secret checks. An initial expanded fixture left
its own synthetic active document visible to the following delivery suite; it
was corrected to archive its fixture, and the final full database suites pass.
Both version 004 and 005 migrations were reapplied idempotently in the rehearsal.

108 existing document browser regressions, eight image/PDF preview cases and four
new pending-cleanup browser cases passed in desktop/touch Chrome with intercepted
synthetic APIs. Focused lint, git diff --check and an isolated production build
passed. A separate live adapter check used a generated text object to verify
private copy, full hash inspection, repeated deletion and cleanup of the exact
test keys. That provider fixture is separate from the scoped, user-authorized
gogrit reconciliation above. Live portal-authenticated browser review, deployed
CDN behavior and production scheduler verification remain pending. Restart the
existing development launcher to activate its newly added background worker;
the current review server was not stopped. No commit, push or deployment occurred.


## Client previews and smaller images - 2026-11-25

The client Document Library now shows uploaded image previews first, lazy-loaded
near the viewport, with Hide preview/Preview controls and original view/download
links. PDFs open an inline native browser viewer on Preview; a one-byte access
probe and native byte-range requests keep the initial library from preloading all
PDFs. PDF bytes are not rasterized, rewritten or reduced in resolution. Drive
links still open at Google and unsupported uploaded types remain downloadable.
New source previews are not added. Existing protected-Drive behavior is unchanged.

The user's "divided by 2 resolution" is implemented for raster image previews as
half oriented width and half oriented height, rounded down (minimum one pixel),
with a maximum 1,600px long edge and WebP quality 76. Original Storage/BYTEA bytes,
filenames and downloads remain unchanged. GIF previews use the first frame. The
existing sharp installation is now an explicit pinned dependency, 0.35.4, in
package.json/package-lock.json, for reproducible server image processing.

The preview UI is shared under components/documents; the Admin preview remains
on demand, using its existing full-size private image response. Client list
metadata includes only the permitted MIME and preview kind, not private object
paths or signed credentials. Each image preview request repeats the same live
client/membership/publication/revision checks and rechecks access after image
conversion, before returning bytes. Client changes remount the library so previous
preview state and links cannot carry into the next workspace. Responses remain
private/no-store; no shared thumbnail cache, public URL, external renderer or
persisted derivative copy is introduced. No new bucket, env variable or migration
is needed. The existing authentication and private Storage setup still applies.

Thumbnail conversion bounds the original server read to 32 MiB and 40 million
input pixels, and has a 12-second image-processing deadline. Those are preview
resource limits only, not new upload limits. Files that cannot be decoded or are
too large for this bounded conversion retain original view/download, with retry
feedback. Embedded image metadata is stripped. The first request still reads the
original from private Storage on the server, so this reduces browser transfer and
render size without claiming a measured end-to-end speed improvement or lower
provider egress for the first read. No customer documents were rewritten.

Actual verification: 425 offline tests passed, including true half-dimension,
orientation, transparency, metadata stripping, pixel/byte safety and invalid-content
checks. 56 database/API checks passed on disposable WSL PostgreSQL using ordinary
runtime roles, synthetic users and mocked providers. They cover both Storage and
legacy BYTEA thumbnails, original-byte preservation, revoked membership during
provider read, unsharing, stale/foreign IDs and existing upload/delete regressions.
An initial Storage capability assertion exposed a text-file View link that the
delivery endpoint would refuse; the capability now matches safe image/PDF types,
and the full rerun passed. No new source-code inline capability was enabled.

36 desktop/touch Chrome checks passed for new client image/PDF previews plus
existing Admin previews and client loading/focus/revocation behavior. Client
image screenshots were inspected at desktop/mobile widths. Browser APIs are
intercepted fixtures; real image transforms are separately tested in Node and the
database suites. PDF extension load success is asserted. Focused lint and an
isolated production build passed. Live authenticated client review, real mobile
engines and deployed/CDN performance remain pending. The review server was not
stopped, no env/private account files were changed, and Neon was untouched.
No commit, push or deployment was performed for this preview addition.
