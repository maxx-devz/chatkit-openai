# Portal integration audit and sync health

The scope sheet's P0 Platform row calls for an audit log plus integration sync health and failures. This implementation establishes the portable PostgreSQL `portal_integration_runs` table and an admin-only Audit Log at `/internal/audit` (also available as `GET /api/internal/audit`). It is separate from the existing `portal_internal_access_audit` account-change table. Both are shown in the read-only view; the browser has no database credentials.

## Current coverage

- A connected internal user's live Hubstaff dashboard load records a `running` row before the provider read, then `succeeded`, `partial`, or `failed` after it completes. The row includes source, operation, environment, request trigger and UUID, initiating portal user ID, times, task-plus-project record count, and the number and outcome of 401-triggered renewals. A bounded/truncated provider result is `partial`, not a full success. Fields for records written/skipped/failed, connector version, and source window are present for later connectors; they remain zero/null for this read-only request. Failures store only a controlled error code, never provider messages, URLs, task contents, passwords, or tokens.
- Account creation, account updates, role grants/revocations, manager password resets, and terminal role changes continue to use `portal_internal_access_audit`. Terminal events have no portal actor ID; the terminal operator is not yet identified in that table.
- `platform.audit.read` is granted only to `internal_admin` for now. Access Managers and planned Leadership/developer roles cannot read the log. The API enforces this even when opened directly and returns only the latest 30 records from each table. The rows remain in PostgreSQL; the page limit is not a retention policy.
- Hubstaff does not provide an authoritative source timestamp for this dashboard response, so `source_timestamp` remains null. A null is preferable to presenting portal completion time as the source's update time.

## Deployment

After the existing portal and internal-user migrations, verify the intended database and run `npm run integration-audit:migrate -- --dry-run`, then `npm run integration-audit:migrate` against that same environment. Do not test the migration on production first. The migration uses standard PostgreSQL SQL and is portable to Neon or Supabase PostgreSQL. Deploy the code only after the audit migration; a connected Hubstaff dashboard load requires the table to start its run record.

## Remaining scope from the sheet

There is no scheduled background sync worker in the current portal. Future Hubstaff Time/Tasks, HubSpot, Help Scout, Drive, and other connector jobs must use this run lifecycle, including source timestamps when the provider supplies them, records processed, retries, and sanitized failure codes. Before enabling write-back, add action-specific audit records with actor, target, outcome, and recovery correlation; do not treat integration-run records as a substitute for write-action audits. Permission-aware AOC-GPT requests/actions and restricted HR reads need their own approved audit policy. Set a retention and archival policy before production volume grows, and decide whether Leadership or developers should receive a dedicated, narrower operational-read permission.
