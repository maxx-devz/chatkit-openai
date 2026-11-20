# Client Documents: setup, approval and protected delivery

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
