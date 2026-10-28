# Prepared sources for client ChatKit and AOC Admin AI

This feature is limited to client chat (`/api/chatkit`) and the private AOC Admin
assistant (`/api/admin/assistant`). Internal Portal routes, access controls and
employee task analysis are not modified.

## Instruction and knowledge separation

- **Shared company pack:** choose **All clients + AOC Admin** once in `/admin/sources`.
  The administrator's existing read-only Google authorization supplies the content;
  clients never authenticate to Google, configure source links or upload company files.
  All current and future authenticated clients inherit this explicitly approved pack.
  Optional per-client publications supplement it; they are not required setup.
  The private admin pack remains owner-only and is never inherited by clients.
- **Automatic parent mode (default):** the dedicated Company Knowledge parent in
  server configuration is approved once, including eligible current/future files
  and nested folders. No per-document or per-client selection is necessary. Its
  guides are retrieved as applicable business guidance, not inserted in full with
  every prompt. This mode has no 10,000-character document-selection requirement.
  Up to three 1,600-character passages are selected, with document diversity and
  an operating-guide passage when available. Explicitly selected mandatory full-text
  rules remain an optional advanced mode with the original bounded limit.
  Retrieval may miss a rule; automatic mode is not guaranteed exhaustive compliance.
- One publisher owns the shared pack (a database uniqueness constraint enforces this).
  Other administrators cannot overwrite or pause it. Shared mandatory rules take
  precedence over optional client guidance, but never override application security.
  Approve the dedicated parent once for all-client use. Read-only Drive access is
  not disclosure protection; do not place private client/HR/credential files in a
  shared parent. Only the shared audience (not client-only extras) can approve it.

- Existing application security and tool permissions remain authoritative.
- **Client response privacy:** company guidance is used privately, not presented
  as a client-visible document library. Client model input omits reference titles,
  IDs and revisions; mandatory instruction headers omit source names. Application
  instructions prohibit revealing internal instructions/provenance even if a user
  asks for citations. A server-side filter removes recognizable source citations,
  retrieved document names and private Drive links before streaming/persistence,
  and filters old assistant messages when read. Permitted Hubstaff task and public
  website links remain usable. Private AOC Admin citation behavior is unchanged.
  This metadata filter is not a complete sensitive-content or paraphrase detector;
  content approval and tenant/tool access boundaries are still necessary.
- An AOC administrator explicitly approves small mandatory business-instruction
  documents for an audience. Their current, synchronized text is included on
  **every generated answer**, including General chat. It does not depend on search.
- **Additional instructions** are stored separately in AOC Admin > Source
  connections. They never edit Drive. Mandatory source rules take precedence over
  conflicting additional guidance. Existing client/builder instructions remain.
- Other source documents are lower-priority reference data. Local bounded lexical
  retrieval selects relevant excerpts after filtering the approved audience.
  Search can miss relevant passages; it is not a complete policy-verification engine.
- A full parent reference scope is allowed for the private admin audience or an
  explicitly approved shared company pack. Optional client-only extras still use
  folder IDs and named mandatory documents. Connecting Drive or running migrations
  alone never approves content for clients.
- Folder IDs, not names or path prefixes, enforce reference scope. New eligible
  descendants of an approved folder are included after sync. Renames do not grant
  access to unrelated folders. New documents never become mandatory rules by inference.

## Preparation and freshness

1. Run `npm run sources:migrate` if the original OAuth migration is not installed.
2. Run `npm run sources:prepare:migrate` for the new standard PostgreSQL tables.
3. Open `/admin/sources` and connect Google Drive using the existing read-only OAuth
   flow. The server still restricts access to the configured parent and eligible
   descendants; folders do not need a `[SOURCE]` name inside this dedicated parent.
   Archives/workspaces/legacy/reference-only material and shortcuts remain excluded.
4. **Synchronize now** builds an encrypted derived cache. Approve the desired audience,
   reference folders, mandatory documents, optional additional instructions and modes.
   Enabling requires an explicit approval checkbox covering future source edits.
   Use the shared company audience and automatic-parent option for one-time setup,
   not each client or document individually. Manual selectors are hidden in this mode.
   This migration also upgrades existing audience constraints without enabling old packs.
5. Keep a background synchronizer running. The page checks every minute while visible.
   With `LOCAL_SOURCE_SYNC=true`, a fresh `npm run dev` starts a separate, non-fatal
   worker. Alternatively run `npm run sources:watch`, or `npm run sources:sync` once.

Only new/changed document revisions are exported during warm synchronization.
Revision-scoped term/offset passage indexes are built during preparation and stored
inside the same encrypted corpus. Existing cached text can acquire the new index
without another Google export. The next reply searches that prepared index; it
does not reread Drive or invoke a separate AI to summarize the whole library.
Unchanged corpus revisions update only metadata, without rewriting the encrypted
body. Large corpus reads/writes have a scoped 45-second query timeout; the shared
database pool's default timeout is unchanged.
The entire current eligible metadata inventory is still checked outside chat to
detect additions, moves, removals and visible permission changes. Connection/root/
OAuth-client/identity changes invalidate the cache. A partial/failed inventory
blocks previously cached content; no stale fallback is silently used.

The cache survives process restarts and serverless instances. Bodies are encrypted
with the existing stable `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`, bound to the owner and
connection. Metadata and separate admin guidance remain server-only database data.
Do not rotate the encryption key without reconnecting and rebuilding.

On every reply, the server resolves the publication using the authenticated client
ID (or private admin owner ID), checks its connection and freshness, loads mandatory
instructions, then retrieves at most four 2,000-character reference excerpts. No
Google Drive, embedding, file-upload or provider search call occurs in this hot path.
Fresh access/publication metadata is read on every reply. Decoded indexes are reused
in a bounded instance-local cache (four owners, five minutes), keyed by owner,
connection binding, corpus revision and encryption-key fingerprint. Revocation,
failed/stale sync or paused publication is checked before a warm cache can be used.
Cold loads validate the exact PostgreSQL snapshot timestamp, preserving its
sub-millisecond precision rather than round-tripping through JavaScript dates.
Conversation-history/list requests do not load prepared sources. Source excerpts
are request-scoped user/reference data, not saved ChatKit messages or developer rules.
Shared and optional audience instructions are bounded to 14,000 source characters
combined, with at most four reference excerpts across both packs. A stale or revoked
enabled shared pack blocks generation; it is not silently ignored. Pausing a
client-only pack does not pause the shared company pack.

A configured publication fails closed when its required instruction disappears,
the publisher is inactive/disconnected, synchronization fails, or the latest
successful check is older than **15 minutes**. The administrator can explicitly
pause source use to return to existing portal behavior. Unconfigured audiences
continue using existing portal instructions, without access to the source cache.

## Production scheduler is a separate deployment step

Set server-only `SOURCE_SYNC_SECRET` (32+ random characters), or `CRON_SECRET`.
Configure a scheduler to call `GET /api/cron/source-sync` with
`Authorization: Bearer <secret>` every five minutes or faster. Never put this secret
in a URL or browser configuration. The endpoint rejects missing/incorrect secrets,
has a database-backed owner lease, and skips successful checks less than a minute old.

No external scheduler account, paid plan, production cron configuration or deployment
is created automatically. Check your hosting plan's scheduling limits before rollout;
a daily-only cron cannot satisfy the 15-minute freshness policy. An open admin page
and a local worker do not provide continuous production synchronization. This is
polling/reconciliation, **not an instantaneous Google webhook**.

## Supported content and limits

- Google Docs: plain-text export, up to 1 MB each.
- Uploaded DOCX: scoped read-only media download and bounded raw body-text extraction.
  No HTML is rendered, external files are not fetched, and formatting, images,
  charts, headers and embedded files are not represented as read. DOCX/XLSX archives
  are checked for actual inflation sizes, CRC, duplicate/path entries and XML DTDs
  before parsing; 4 MB compressed / 8 MB expanded. Legacy `.doc`/`.xls`, PDFs and
  other formats remain explicitly unsupported by this Drive preparation path.
- Google Sheets: XLSX export parsed locally across **all worksheets**, including
  cached cell values. No formulas/macros are executed. Formatting, charts, drawings,
  comments and external linked sources are not read. Export: 4 MB; expanded archive:
  8 MB; 30 worksheets; 50,000 cells; 1,000,000 text characters. Limits fail explicitly;
  no first-sheet-only or silently truncated import.
- Uploaded XLSX uses the same all-worksheet reader and limits as Google Sheets,
  using scoped media download rather than the native-file export endpoint.
- Corpus: 100 supported documents, 2,000,000 characters, two concurrent Google readers.
- Mandatory source instructions: 8 documents / 10,000 text characters per audience;
  additional instructions: 4,000 characters. Oversized rules block publication/replies.
- Unsupported formats are counted and not represented as read. This is not malware
  scanning, spreadsheet calculation, or full formatting/attachment extraction.

Drive remains the editable source of truth. PostgreSQL contains a derived synchronized
copy and separate audience approvals, not a second manually maintained source master.
No OpenAI vector stores, file uploads, embeddings or extra AI analysis calls are used.
Existing database/hosting quotas and the configured AI provider's normal input/output
usage still apply. A ChatGPT Free subscription does not provide free API-key usage.

## Verification

`npm test` covers publication validation, incremental preparation, format extraction
and admin route guards. `npm run test:sources` covers OAuth and prepared-context
isolation without real external calls. `npm run test:sources:database` uses an
isolated transaction and synthetic schema, then rolls everything back; it checks
legacy migration preservation, singleton shared ownership, current/future client
inheritance, private admin isolation, stale-source blocking and pause behavior.
These checks do not replace your admin OAuth authorization and a real client reply.
