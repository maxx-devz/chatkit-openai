# Read-only Google Drive source test

This guide covers the **AOC Admin-only connection, private preview and optional AI
test** at `/admin/sources`. Discovery/preview do not send source content to AI.
The private AI test defaults to automatic parent sources and sends relevant
excerpts after per-run parent-scope consent; advanced manual selection remains
available. The separate [prepared chat sources](PREPARED_CHAT_SOURCES.md) feature
adds durable background preparation, per-audience approval and additional
instructions for client ChatKit and private AOC Admin chat. Nothing is published
by merely connecting Drive. Internal Portal code and shared login behavior are unchanged.

## Free test setup

1. Use a company-authorized Google Cloud project. Leave billing unlinked: do not
   activate a trial, request paid quotas, or enable unrelated paid services.
   Standard Drive API usage is currently free within standard quotas; future
   overage pricing is not a promise of unlimited free usage.
2. Enable **Google Drive API** in that project.
3. Configure Google Auth Platform branding, audience and consent. Use testing
   mode; for an External audience, add `jaymark@alwaysopencommerce.co` as a test
   user. A managed domain's administrator may restrict these operations.
4. Create a **Web application** OAuth client with this exact local redirect:

   `http://127.0.0.1:3000/api/admin/source-connections/callback`

   Add a separate exact staging callback only when deployment is approved.
   Do not interchange localhost and 127.0.0.1 without updating configuration.
5. Set the server-only variables from `.env.example` in `.env.local`:
   `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
   `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_DRIVE_ALLOWED_EMAIL`, and
   `GOOGLE_DRIVE_ROOT_FOLDER_ID`. Use a stable random encryption key of 32+
   characters; changing it requires reconnecting this integration. Do not
   reuse or rotate the existing provider-settings encryption secret.
6. Run `npm run sources:migrate`. It creates isolated portable PostgreSQL tables
   for admin-owned connections and short-lived OAuth challenges only.
7. Restart the local web server. Sign in to AOC Admin, open **Source connections**
   and choose **Connect Google Drive**. Google authorization is separate from
   the portal login. Select Jaymark and grant read-only Drive access.
8. The eligible source list loads automatically after connection and refreshes
   every minute while the page is visible. **Discover / refresh sources** remains
   available for an immediate manual check. Use **Private preview** for a Google
   Doc or Sheet. Compare the content and modification time with Drive. A live read must
   pass before claiming this connection works.

## Private AI source test

The **Private AI source test** panel defaults to **Automatic parent sources**:

1. Ask a question; do not select individual files or provide new source links.
2. Authorize parent-scope processing by the displayed provider for that run,
   including new/changed eligible documents, but not client publication.
3. Before each answer the server checks current parent/descendant metadata,
   including revisions and content-download restrictions. Reconciliation covers
   additions, edits, moves, removals and visible permission changes. New folders
   must be eligible `[SOURCE]` trees; archives/workspaces/references stay excluded.
4. Only new/changed Google Docs and Sheets need exporting while the private memory cache is
   warm. Reconnect, identity/root/client changes, failed synchronization, revoked
   access, ten-minute expiry, capacity eviction, restart or a different serverless
   instance invalidate/rebuild the cache. It is not durable synchronization.
5. The supported corpus is read/indexed locally within private-test bounds:
   40 Google Docs/Sheets / 2,000,000 characters, two concurrent Google readers, five
   concurrent administrators. No partial corpus is used after indexing failure.
   Unsupported formats are listed, not represented as read.
6. Local lexical retrieval supplies at most 8 documents with relevant excerpts
   (or full short documents), plus bounded directory metadata (200 entries /
   24,000 characters). Results distinguish full/excerpt coverage and include exact
   revisions, supplied-content hashes, fetched/reused/new/removed counts and
   unsupported files. Directory truncation is explicit in sync data.

Folder changes alone make no paid AI requests. Minute polling is metadata-only
and pauses when hidden; an independent fresh check happens before each automatic
answer. No 24/7 webhook, external scheduler, paid index or provider file upload is
added. Original Drive files remain the editable source of truth; the cache is
derived data in private server memory, not a duplicate editable master.

Source guidance remains lower-priority input under fixed application safety
rules and applies only in this private simulation. Lexical retrieval can miss
relevant rules; this is not a verified production policy engine applying every
source instruction. This test does not configure client/admin chat publications.
Automatic discovery does not approve new documents for clients.

### Advanced manual test

Choose **Advanced: select individual files** to test specific revisions:

1. Select 1–3 Google Docs or Sheets (nothing is selected by default). Preview each document
   to review its current content. Other file types remain unsupported for tests.
2. Leave **Reference facts only**, or explicitly choose **Reviewed instruction
   simulation** after previewing that revision. This is not production approval.
3. Enter a question and review the destination provider/model displayed in the
   panel. It uses the current AOC Admin provider connection, never a copied key.
4. Authorize the selected full document text and question being processed by that
   provider, then choose **Run private AI test**. Provider charges and policies
   apply; discovery/preview do not invoke the AI provider.
5. Review the response alongside inline `[S1]` citations, supplied revision IDs,
   modification times and SHA-256 content fingerprints. Citations show supplied
   sources, not independent validation of the model's interpretation.

The server reauthenticates AOC Admin, validates the request origin and rechecks
the owner's Drive connection, eligibility/ancestry and exact revisions before
reading content. It rechecks access and revision again after export. Changed,
revoked, outside-scope or oversized sources fail before any model request. It
does not rescan the entire tree for every prompt or fetch unselected sources.
Combined text is bounded at 200,000 characters; it is not silently truncated.

The backend fixes the application safety instructions and passes source text as
lower-priority JSON input. Only documents explicitly marked for instruction
simulation can supply relevant safe business/response rules; reference facts do
not become application instructions. No tools, uploads, vector-store writes,
Hubstaff context, prior conversation or client identifiers are supplied.

The request uses `store: false`, no automatic retries and a bounded deadline.
This is not a promise of zero provider retention. The question and reply remain
in current page/server request memory; automatic source text may also be held in
the bounded private server-memory cache, not portal or
browser persistent storage. Aggregate AI usage is recorded using existing admin
accounting. Cancellation is propagated where possible; work already accepted by
a provider may still be billed. Missing citations are flagged, unknown source
citations and incomplete responses are rejected.

The test has an instance-local owner lock plus a 30-second cooldown. This is not
a distributed production quota. Before any deployment, add durable account/rate
and spending controls, source-owner/organization processing approval, provider
retention review, classification checks and live behavior evaluations. This
private prototype does not replace those approvals.

## Security and source boundaries

- OAuth code flow uses PKCE, a browser HTTP-only state cookie, an expiring one-use
  database challenge, and the current administrator and Better Auth session.
  Callback origins come from server configuration, not the request Host header.
- Verify Google's signed ID token, verified email, audience and granted Drive
  read-only scope. Only the configured Google test account is accepted.
- Refresh tokens and PKCE verifiers use purpose-bound AES-256-GCM encryption.
  Refresh tokens stay in PostgreSQL, never browser storage or `.env.local`.
  OAuth client credentials stay in server-only environment settings.
- `drive.readonly` covers all files the Google account can read; Google does not
  enforce the application's folder allowlist. The backend enforces that limit.
- A connection belongs to its AOC administrator. Other admin logins, clients and
  Internal Portal accounts cannot use its credentials or management endpoints.
  Client chat can use only explicitly published prepared content through the
  separate audience-scoped cache; it cannot access this connection directly.
- Discovery follows direct `[SOURCE]` folders under the configured parent and
  eligible descendants, plus root files. Archives, legacy, workspace and
  reference-only trees, deleted items and shortcuts are excluded. A folder name
  never makes a source automatically approved for client use.
- Pagination, request/file/depth bounds and incomplete-search checks prevent a
  partial inventory from being described as complete.
- Preview revalidates current ancestry and access on each request. Google Docs
  plain text is supported up to 1 MB, without silent truncation. Google Sheets
  use bounded XLSX export across all worksheets; see the prepared-source guide
  for parsing limits. Other formats are listed as unsupported.
- Render source text and test replies as escaped plain text, never executable
  HTML. The private test treats source text as lower-priority input. Prepared chat
  uses only explicitly approved mandatory documents as business instructions.
- The API's `source-connections` path uses the debugger's existing sensitive-path
  exclusion. Tokens and raw Google error bodies are never deliberately logged
  or returned to the browser.
- Disconnect removes local credentials and attempts Google revocation. If
  revocation fails, the UI instructs the owner to revoke the app manually.
- External OAuth apps in Testing can have short-lived refresh authorization;
  support Reconnect. Verification/security-assessment and organization-policy
  requirements must be reviewed before wider deployment.

## Prepared chat integration and remaining deployment work

The prepared-source guide documents the encrypted persistent cache, background
reconciliation worker, protected scheduler endpoint, per-client approval and
chat integration. These are separate from the private simulation described here.
Production scheduling/deployment, live AI behavior evaluations, Google webhook
subscriptions and all-format parsing are not automatically configured. Separate
custom GPT editor instructions are not inherited through Drive.

Before client publication, a source owner must approve destinations, provider
processing, classification, retention and revision approval. The private memory
cache and durable prepared index are derived copies, not editable replacements for
the original source. Prepared chat publications enforce connection binding,
successful synchronization and a 15-minute freshness limit.

## Official references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/limits
- https://developers.google.com/workspace/drive/api/guides/manage-changes
- https://developers.google.com/workspace/drive/api/guides/push
- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/docs/guides/your-data
