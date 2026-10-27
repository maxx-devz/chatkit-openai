# Client chat: task follow-ups, comments and attachments

Client ChatKit resolves a follow-up such as “show me the comments on that task”
against this user's saved conversation. The current request chooses the operation.
Earlier assistant text cannot activate a credential scan, historical date range,
time/budget query or unrelated task selection. Explicit task links override older
links. The most recent user task link is preferred over assistant-generated links.
Credential scans require a current explicit request across tasks; they are not
triggered by asking about one task's comments.

The server verifies the task's owning list/project before reading comments or
attachment metadata. Comments preserve useful surrounding text and redact detected
credential values rather than dropping every comment mentioning API access.
At most 40 chronological comments / 30,000 characters are supplied per task,
with a 4,000-character comment limit and explicit truncation/redaction flags.
These bounds do not promise the complete discussion.

## Response redaction

Both client ChatKit and AOC Admin text replies are checked before text is emitted.
Candidate message chunks are withheld until the complete message is available,
then sanitized through the normal ChatKit events. This prevents a known secret
split across deltas from briefly appearing. Cancelled/failed unfinished candidates
are discarded. The client keeps workflow/loading events while waiting for text.
No additional AI call is used for redaction.

Covered patterns include credential assignments, authentication headers, common
provider tokens, JWTs, private-key blocks, credential URLs, connection strings,
email addresses and exact known server/provider secret values. Benign API discussion
and canonical task links remain readable. ChatKit persistence and assistant-history
reads also sanitize assistant text. Builder preview text uses the same filter.
Existing stored rows are not bulk-rewritten by this change.

This is deterministic best-effort redaction, not complete secret detection or
malware scanning. Generated file contents, images and every possible unknown secret
are not covered by a text-pattern guarantee.

## Hubstaff attachment limitation

The official [List task attachments API](https://developer.hubstaff.com/tasks/reference/attachments/)
returns IDs, names, task/user IDs and timestamps, without file bytes or a download
URL. A read-only check of the reported task confirmed the same response shape.
The portal lists names for the verified task only, marks `contentAvailable:false`,
and asks the user to upload the file in ChatKit to read it through the existing
attachment capability. It never invents a download endpoint, follows comment links,
forwards a Hubstaff PAT to a file host, or claims attachment contents were read.
Automatic Hubstaff file-content reading still needs a supported authorized download
mechanism; no browser-cookie workaround is added.

## Validation

- `npm test`: query routing, safe comments, redaction and admin stream regressions.
- `npm run test:hubstaff`: mocked API integration including cross-project denial.
- Python unittest discovery: actual SDK/ChatKit event bridge with fake provider,
  split-secret output, cancellation and redacted persistence/history checks.

Deploy/restart both Next.js and Python to use the response changes. No client
record, task, comment, attachment or Internal Portal code is changed by these checks.
