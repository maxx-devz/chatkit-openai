# Client ChatKit attachments

The client ChatKit composer has a native attachment button. Files are uploaded
to the portal, stored privately in the existing PostgreSQL database, and included in
the assistant's model input when the client sends a message. Uploading alone
does not make an OpenAI request or consume a monthly chat attempt.

## Supported files and limits

| Category | Extensions |
| --- | --- |
| Documents and slides | `.pdf`, `.docx`, `.pptx` |
| Spreadsheets and tables | `.xlsx`, `.csv`, `.tsv` |
| Structured data | `.json`, `.yaml`, `.yml`, `.xml` |
| Text and source references | `.txt`, `.md`, `.log`, `.html`, `.css`, `.js`, `.ts`, `.py`, `.sql` |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif` |

- 2 MiB (2,097,152 bytes) per file; three attachments per message.
- 30 accepted-format upload attempts per user/client per UTC day.
- 50 MiB total attachment storage per client, shared across its users.
- Executables, general ZIP/RAR archives, unknown extensions, and macro-enabled
  Office formats are not accepted. Export older `.doc`, `.xls`, or `.ppt` files
  to `.docx`, `.xlsx`, `.pptx`, or PDF first. Use UTF-8 for text and data files.
- The server checks allowed extensions, basic binary signatures, text encoding,
  JSON syntax, and Office ZIP metadata/size limits. These checks are not a full
  document decoder and cannot guarantee a file is safe, readable or unencrypted.
  Use unencrypted documents and non-animated images supported by the model.
- The six most recent attachments in the bounded conversation context are
  included. Repeated references to the same attachment do not resend its bytes
  in the same request. Older omitted attachments are labeled in model input.
  Text/source references are limited to 40,000 characters per file, with an
  explicit truncation marker. Large files may need to be split into smaller parts.
- OpenAI's document processing applies its own limits. PDF processing can include
  page images; DOCX/PPTX processing extracts text, so embedded charts/images may
  require a separate screenshot or PDF. Spreadsheet inputs are not a guarantee
  of exhaustive workbook calculation. Ask for a focused range or provide a CSV
  extract for precise table review. See [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs).

## Requirements and permissions

1. Use the existing `DATABASE_URL` in both Vercel projects. The database role
   running the migration needs permission to create the two upload tables and
   their indexes. The app role needs normal read/write access to them.
2. Keep the existing backend `OPENAI_API_KEY`, API credits, and `OPENAI_MODEL`.
   The selected model must support the requested file or image input. File
   content contributes to model usage when a reply is requested. This integration
   sends content through Responses; it does not create OpenAI Files API objects
   or add uploads to a shared knowledge/vector store.
3. No new API key, OpenAI Admin key, Google Drive permission, Vercel Blob store,
   or virus-scan API is required.
4. Clients must be signed in, belong to the active client account, and have AI
   access enabled. Only that uploading user/account can attach those files.
   Uploaded files are not shared with another client or staff draft test.
5. `CHATKIT_UPLOADS_ENABLED` defaults to `true`. To disable new attachments, set
   it to `false` on **both** Vercel projects and redeploy. Already attached files
   stay in saved conversations and remain usable in those conversations.

## Deploy step by step

1. From the project folder, run:

   ```powershell
   npm run uploads:migrate
   ```

   This adds `portal_chatkit_uploads` and `portal_chatkit_upload_attempts` without
   replacing existing conversations. It can be run again safely. It uses the
   database in `.env.local`; if Vercel uses another database, apply the migration
   there too. It is also available as `chatkit_backend/upload_schema.sql` for a
   database SQL editor.
2. For a local test, stop your own dev command with Ctrl+C, then run
   `npm run dev` again. Both local services inherit `.env.local`.
3. Commit and push the source changes, including new files, to the GitHub branch
   connected to Vercel. Do not commit `.env.local` or credentials.
4. Confirm **chatkitbackend** deploys this revision with root directory
   `chatkit_backend`, and **quantum-project-xi** deploys the frontend revision.
   Wait for both deployments to show **Ready**. No dependency change is needed.
5. Refresh the live Quantum page with Ctrl+Shift+R and sign in as a client.

## Use it step by step

1. Open **AI Assistant** or the dashboard's AOC-GPT panel.
2. Click the attachment / plus button beside the composer and select a supported
   file. Wait until the file chip appears without an upload error.
3. Add a request such as “Summarize this PDF,” “Compare the totals in this CSV,”
   or “Explain this screenshot,” then send. A file can also be sent by itself.
4. To remove a pending attachment, use its remove button before sending. After
   sending, it stays with that conversation and can be used in follow-up questions.
5. To retain a file across conversations, explicitly ask the assistant to save
   it to the client library and confirm that indexing succeeded. See
   [Persistent client library](CLIENT_LIBRARY_SETUP.md).
6. Delete a conversation from ChatKit history to remove its ordinary uploaded files too.
   This deletion is permanent. Abandoned uploads expire from access after
   24 hours and are physically cleaned up on a subsequent upload for that client;
   there is no scheduled purge for inactive accounts.

## Security choice and troubleshooting

At your request, the external virus-scan API is not included. Uploaded content is
never executed by this application. The assistant treats it as untrusted reference
data, not permission to change instructions or run tools. AI interpretation is
not malware scanning, so the earlier proposal to block an account after three
malware detections is not active. Normal size, storage and daily limits remain.

- No attachment button: confirm the frontend deployed the new code and that
  `CHATKIT_UPLOADS_ENABLED` is not false, then refresh the browser.
- “Attachments are not ready”: run the upload migration on the backend's
  database and check the backend flag and deployment revision.
- Wrong file type or damaged file: export an allowed format; changing the
  filename extension alone does not convert a file.
- Storage full: delete unneeded conversations containing your uploaded files;
  another user's files still count toward the client's shared storage limit.
- Model cannot read it: check model support, API billing, document encryption,
  and file contents. Use a smaller PDF, CSV extract, or screenshot as appropriate.

Uploads fit below [Vercel's request-body limit](https://vercel.com/docs/functions/limitations).
The frontend forwards one bounded file at a time to the existing signed backend.
No public file URLs or permanent server filesystem are used.


## Attachment timeout diagnostics — 2026-11-26

The attachment save endpoint does not call an AI provider. Upload alone cannot
exhaust OpenAI credits. A Next.js `TimeoutError` for `/api/chatkit/upload` means
the signed backend attachment request exceeded its deadline, not a provider billing
rejection. The historical 47-second proxy timeout was not reproduced during this
follow-up. Read-only checks found the approved Supabase runtime reachable, with
the required attachment SELECT/INSERT/DELETE privileges and no blocked sessions
at the time measured. No live upload or account credentials were used in testing.

Storage now has a three-second transaction-local lock wait limit. The Python
operation has a 30-second deadline, leaving time to return a structured error
before the existing 45-second proxy deadline and 60-second route budget. Timeout
while reading the upstream body is preserved instead of swallowed as malformed
metadata. User cancellation, unavailable backend, workspace lock contention and
timeout have distinct safe error codes/messages. Lock conflicts return 409
`upload_busy`; statement or request timeouts return 504 `upload_timeout`.
Only fixed stage/code/SQLSTATE diagnostics are logged; no filenames, file bytes,
signed payloads, database URLs or credentials. There is no automatic upload retry.

Client membership, active-workspace checks, signatures, validation, size/storage
limits and private cache headers remain enforced. This uses the existing standard
PostgreSQL schema and connectors; no migration or environment change is required.
The separate Document Library Storage path is unchanged.

Verification: 434 offline Node tests passed (including 25 focused logger/upload
cases), 17 focused Python tests passed, focused lint and isolated production build
passed. A disposable WSL PostgreSQL fixture verified actual byte persistence,
foreign-owner denial, a roughly three-second row-lock failure with no partial file,
and one successful save after the lock was released. Fixtures were removed after
the check. HTTP/provider calls were mocked; a real authenticated upload on the
user's database still needs user verification. No live database write, migration,
provider call or private environment edit was made by this follow-up. Code changes
are local and have not been committed, pushed or deployed.
