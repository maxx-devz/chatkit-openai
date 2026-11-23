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
