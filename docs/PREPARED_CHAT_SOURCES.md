# Prepared sources for client ChatKit and AOC Admin AI

This feature is limited to client chat (`/api/chatkit`) and the private AOC Admin
assistant (`/api/admin/assistant`). Internal Portal routes, access controls and
employee task analysis are not modified.

## Instruction and knowledge separation

- Existing application security and tool permissions remain authoritative.
- An AOC administrator explicitly approves small mandatory business-instruction
  documents for an audience. Their current, synchronized text is included on
  **every generated answer**, including General chat. It does not depend on search.
- **Additional instructions** are stored separately in AOC Admin > Source
  connections. They never edit Drive. Mandatory source rules take precedence over
  conflicting additional guidance. Existing client/builder instructions remain.
- Other source documents are lower-priority reference data. Local bounded lexical
  retrieval selects relevant excerpts after filtering the approved audience.
  Search can miss relevant passages; it is not a complete policy-verification engine.
- A full parent reference scope is allowed only for the connection owner's private
  admin assistant. Clients require individually approved folder IDs and/or named
  mandatory documents. Nothing is published to a client automatically.
- Folder IDs, not names or path prefixes, enforce reference scope. New eligible
  descendants of an approved folder are included after sync. Renames do not grant
  access to unrelated folders. New documents never become mandatory rules by inference.

## Preparation and freshness

1. Run `npm run sources:migrate` if the original OAuth migration is not installed.
2. Run `npm run sources:prepare:migrate` for the new standard PostgreSQL tables.
3. Open `/admin/sources` and connect Google Drive using the existing read-only OAuth
   flow. The server still restricts access to the configured parent and eligible
   `[SOURCE]` descendants; archives/workspaces/legacy/reference-only material is excluded.
4. **Synchronize now** builds an encrypted derived cache. Approve the desired audience,
   reference folders, mandatory documents, optional additional instructions and modes.
   Enabling requires an explicit approval checkbox covering future source edits.
5. Keep a background synchronizer running. The page checks every minute while visible.
   With `LOCAL_SOURCE_SYNC=true`, a fresh `npm run dev` starts a separate, non-fatal
   worker. Alternatively run `npm run sources:watch`, or `npm run sources:sync` once.

Only new/changed document revisions are exported during warm synchronization.
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
Conversation-history/list requests do not load prepared sources. Source excerpts
are request-scoped user/reference data, not saved ChatKit messages or developer rules.

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
- Google Sheets: XLSX export parsed locally across **all worksheets**, including
  cached cell values. No formulas/macros are executed. Formatting, charts, drawings,
  comments and external linked sources are not read. Export: 4 MB; expanded archive:
  8 MB; 30 worksheets; 50,000 cells; 1,000,000 text characters. Limits fail explicitly;
  no first-sheet-only or silently truncated import.
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
