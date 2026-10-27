# Client project-history search

Work questions can search a prepared PostgreSQL full-text index rather than downloading all Hubstaff task history per prompt. General chat does not receive the tool or index binding. Internal Portal routes, settings and data are unchanged.

## Setup

1. `npm run hubstaff:index:migrate` creates three additive tables and standard PostgreSQL GIN/B-tree indexes. No extensions, embedding service or provider-specific SDK is required.
2. Run `npm run hubstaff:index:watch` for resumable background indexing. Optionally add `LOCAL_HUBSTAFF_INDEX_SYNC=true` to `.env.local` and restart `npm run dev` to start an isolated worker automatically.
3. `/admin/hubstaff-index` shows per-client coverage and offers **Sync next batch**. One click is a bounded batch, not a promise that every historical comment has finished.
4. Deploy both the Next.js proxy and Python backend together. For production configure a scheduler calling `GET /api/cron/hubstaff-index` with `Authorization: Bearer <HUBSTAFF_INDEX_SYNC_SECRET>` (at least 32 characters; `CRON_SECRET` fallback). This change does not create a hosted scheduler or deploy anything. Choose a frequency within the hosting plan and Hubstaff API limits; one minute is a starting point, not a guaranteed SLA. Large initial backfills can use the CLI worker instead.

Optional CLI `--client=<portal-client-id>` limits the worker to one configured client. No browser-supplied project ID can widen the mapping. Schedule overlapping runs safely: per-client database leases prevent concurrent writes. Each batch resumes saved task/comment cursors; a failed or cancelled batch retains completed pages.

## Data flow and isolation

Authenticated client -> server-owned project mapping -> signed index binding -> AI's `search_project_tasks` -> scoped SQL -> bounded relevant tasks/discussion excerpts -> normal sanitized ChatKit response.

The tool accepts keyword/status/person/date/order filters, never SQL, client IDs or arbitrary Hubstaff URLs. The backend independently checks current membership, portal/AI flags, project mapping, binding and recent successful access on every search. Mapping/credential changes invalidate existing access; a sync rebuilds the derived records. Background API calls verify project/list membership and exact task ownership before reading comments. Every child table has client/task scope and composite keys. Credentials and external links are removed before indexing, with response sanitization as additional defense. Redaction is defense in depth, not a guarantee of finding every possible secret or a completed security review. Authorized project text is stored in the existing server-only database; backups/retention inherit that database's policies.

## Coverage and freshness

- Inventory includes available non-removed tasks, active and done, from all board lists, without an invented history start date. Deleted/unavailable history is not restored. A fully paginated scan marks `metadataComplete`; that is separate from discussion coverage.
- Task inventory reconciles at approximately five-minute intervals **while a worker/scheduler is running**. Changed tasks queue discussion refresh; four oldest discussions also refresh per batch because task timestamps may not reflect a comment edit. Large backlogs take longer. Report inventory/discussion timestamps rather than calling every result live.
- A successful access check expires after 15 minutes without a worker. Errors, changed mappings and credential bindings fail closed. Authorization changes in Hubstaff can only be observed at the next access check; this cache is not an instant revocation mechanism.
- Titles, descriptions, verified assignee names, board state, creation/update/completion dates and redacted comments are searchable. Names missing from the project member API remain unresolved. Attachments are not downloaded or indexed; task attachment metadata/current conversation remain available through the existing exact-task flow.
- Inventory pagination is resumable. Each normal batch handles up to two task pages and eight comment pages, 100 records per page. Individual descriptions/comments are bounded (50,000/8,000 characters) and flag truncation. Very large discussions may span multiple batches.

## Answer behavior

The model chooses short concepts/synonyms and structured filters; PostgreSQL full-text search handles lexical matching with English stemming. This is not Google-scale semantic search and does not guarantee every paraphrase matches. Empty keywords plus date/person/status/order filters support broad latest/oldest questions. At most four searches per reply, twenty tasks per search and two bounded comments per task are returned; no entire-history dump enters the model. Exact task links/comments and tracked-time/budget analytics retain the existing verified live-read path.

`recent_activity` means task or indexed discussion changes, not verified tracked work. Hubstaff completion dates do not identify who completed a task. For “oldest task done by X”, clarify attribution or describe **completed tasks assigned to X**, never infer the completer. Global oldest answers are withheld until initial task metadata pagination is complete. Missing matches, unavailable access, partial indexing and unresolved people are distinct outcomes. Existing approved source instructions and response redaction remain in effect.

## Validation

Run `npm run test:hubstaff-index`, `npm run test:hubstaff`, `npm test`, Python unit tests, ESLint and a production build. Optional PostgreSQL integration tests use `HUBSTAFF_SEARCH_TEST_DATABASE_URL` and temporary tables only; they must never delete or rewrite real portal rows. Provider mocks exercise tool wiring without paid AI requests. Actual model behavior and deployed scheduler operation still require environment-specific verification.
