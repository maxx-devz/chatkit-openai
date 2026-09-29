# Persistent client document library

The **Library** tab stores approved client files and HTTPS references across
conversations. It is separate from ordinary ChatKit attachments:

- A normal attachment belongs to one conversation and is deleted with it.
- A file is permanent only after the client explicitly asks the assistant to
  save it to the client library.
- Permanent files are kept in Neon for authorized downloads and indexed in the
  client-specific OpenAI vector store for semantic file search.
- Links store their title, description, reporting period, and URL. The portal
  does not crawl a protected Google Drive or third-party link. Upload the actual
  file, or add a future read-only connector, when its contents must be searched.

## One-time setup

Run this against the same Neon database used by the portal and Python backend:

```powershell
npm run library:migrate
```

Semantic indexing uses a genuine OpenAI key from `OPENAI_API_KEY`. With only an
OpenRouter key, the private Neon library still saves files and links, but OpenAI
semantic indexing is unavailable. Even when both keys are present, hosted
OpenAI vector-store search is attached only to OpenAI chat requests, not
OpenRouter requests. If a client does not yet have an OpenAI vector store, the
first indexed permanent file creates one and saves its ID to
`portal_clients.openai_vector_store_id` for use when OpenAI is active.

Deploy the Python backend and Next.js frontend from the same revision after the
migration. Run `npm run setup:check` to confirm the table exists.

## Client workflow

1. In **Chat**, attach a supported file.
2. Say, for example: `Save this as 2026 revenue, covering 2026-01-01 through 2026-12-31.`
3. Wait for the assistant to confirm both database storage and search indexing.
4. Open **Library** to review, download, or remove it.
5. In any later conversation ask: `Compare the saved 2025 and 2026 revenue reports.`

The reporting dates matter. They let the assistant locate a relevant report
without loading every historical document. CSV, TSV, XLSX, and other validated
text/data files are converted to bounded plain text for search while the original
file remains available for download. PDFs, DOCX, and PPTX are indexed natively.
Images remain downloadable but are marked non-searchable until an OCR workflow
is added. A file whose indexing status failed is still stored and downloadable,
but its contents will not be found through semantic file search until it is
re-indexed.

## Security and limits

- Every database query is scoped by the authenticated client ID. A client
  cannot list, download, search, or delete another client's records.
- Uploaded content is untrusted reference material and never becomes system
  instructions. Links are not fetched automatically, avoiding SSRF and access
  leakage.
- Files retain the existing 2 MiB per-file validation. Permanent files have a
  separate 100 MiB database allowance per client.
- The same file attachment cannot be promoted twice for the same client.
- Removing an indexed file first removes it from the client's vector store and
  then removes the Neon copy. OpenAI notes that vector-store removal can be
  eventually consistent for a short period.
- Downloads do not make a model request. Asking the AI to search, summarize, or
  compare files does use the portal's monthly request allowance and OpenAI API
  tokens.

For a future Google Drive integration, use read-only OAuth, assign one allowed
folder per client, copy only approved files into this library, and keep the
Drive file ID and revision for incremental synchronization.
