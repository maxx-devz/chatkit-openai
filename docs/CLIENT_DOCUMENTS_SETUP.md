# Client Documents: setup, approval and protected delivery

The current implementation provides actual admin reference setup, separate read-only
Google consent, per-file version approval/withdrawal, protected client viewing and
downloading, and saved seven-stage journey progress. Existing Step 1 presentation
files remain historical test fixtures; live routes no longer render them.

Admin: `/admin/client-documents`. Client: `/?view=documents`, with a summary on the
client dashboard. Existing AOC admin and client sign-in/permissions remain in use.

## Before using the save form with an existing admin

The existing admin login is unchanged. No retained review account was created.
The new additive schema must first be approved and applied to the intended
environment; it was applied only to a disposable local PostgreSQL database during
this step. Configured Neon was not contacted or migrated. Until storage is ready,
the page explains that setup is needed; existing library features keep working.

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

### Journey progress

Use **Update verified journey progress** separately. Confirm all seven stage names
against the approved journey, select the current stage and record the verified
project milestone, approval or Billing evidence. The next required client action
and client-safe evidence summary appear in the client's view. An admin-only change
reason is retained in audit history. Earlier stages are represented as completed;
confirm that interpretation before setting the current stage. Completion of the
whole journey requires stage 7 and explicit confirmation.

The field is an authorized human record, not an automatic validation of external
Billing/project systems. Document-stage metadata must match the approved original;
the portal does not edit existing PDFs/Docs to insert stage labels. No file upload
or document approval changes journey progress. No new billing obligations, fees,
payment status or sales metrics are inferred.

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
