# Client Documents: saved Drive references

This small step adds real AOC Admin storage at `/admin/client-documents`. An
authorized existing AOC admin selects a client, saves an original Drive file or
folder reference, and can edit/remove it with a reason. The client-facing library
and journey remain prototypes for this new integration. Saving does not publish,
verify Google permissions, authorize AI ingestion, confirm billing, or advance
journey progress. No duplicate file is uploaded. Removing a reference never
deletes its Google file.

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

No new Google configuration is needed to store an **unverified** link. Google
authentication, approved folder/file selection, released-version verification,
protected client viewing/downloading and automatic synchronization are separate
next steps. The user's connected research account is not a backend Drive grant.
Do not grant a client broad access to an internal folder to make a preview work.

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
  accounts cannot enumerate this admin data. No client-facing API is added yet.
- Existing client rows, Hubstaff fields, library files, conversations, resources,
  credit tables and indexing code are not altered by the feature migration.
- These tables use the baseline application's server authorization model. This
  step does **not** add tenant RLS or protect against a privileged database login.

## Local verification

See `tests/client-document-assignments/README.md` for the guarded database/browser
checks. Database/API/browser verification used temporary generated identities on
a fresh WSL PostgreSQL 18 database, with an ordinary runtime role and separate
operator role. No Google calls, real emails, real client changes or live billing
were involved. Test accounts/database were destroyed after verification.

The separate layout-only server on port 3116, if still running, remains Step 1's
unauthenticated presentation preview. It does not demonstrate persistence or
Google access; review the functional route through the actual protected portal.
