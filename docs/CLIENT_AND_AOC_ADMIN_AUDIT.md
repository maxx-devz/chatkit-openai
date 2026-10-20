# Client and AOC Admin audit logs

This release adds two read-only views and an action-level AI usage ledger:

- **Client Portal → Audit Log** is available only with `client.access_audit.read` (currently the Client Administrator role). The API at `/api/client/audit` resolves the current client on the server and restricts both activity and usage queries to that client. It includes existing membership/access changes, new saved-library changes, and client AI reply usage.
- **AOC Admin → Audit Log** is available only to active AOC administrators at `/admin/audit` and `/api/admin/audit`. It shows AOC configuration/client changes, AOC-created access changes, AOC and client-portal integration runs, and AI usage for all clients or a selected client. Internal-only integration runs stay in the existing Internal Audit Log.
- **AI usage** records one row per assistant reply or builder preview, with client, user, action, provider, model, outcome, and provider-reported input/output/total tokens. Unreported counts are `NULL` and appear as **Unknown**, not zero. The existing monthly totals remain in place. Historical usage is not backfilled because the old aggregate tables have no per-user action data.

The audit tables do not contain prompts, replies, document contents, API credentials, or raw provider responses. The read APIs are server-authorized and return no-store responses. Both views page 20 rows at a time; the AOC view can filter by client. A logged read is an audit event itself. Existing Client Portal **Members & Access** history remains as a focused quick view.

## Database and deployment order

Use the intended environment's `DATABASE_URL` and verify it before running a migration. After the existing `client-access:migrate`, `admin:migrate`, and `integration-audit:migrate` migrations, run:

```bash
npm run admin-audit:migrate -- --dry-run
npm run admin-audit:migrate
```

The dry run applies the SQL in a transaction and rolls it back. The second command persists it. Both use standard PostgreSQL and do not depend on Neon-specific features. Deploy the Next.js and Python changes **after** this migration; new audit writers need the tables and added integration-run columns. Do not run the migration against an unidentified database or assume `.env.local` is the Vercel database.

## Verify after deployment

1. Sign in as a Client Administrator and open Audit Log. Confirm client-specific membership changes and AI usage appear; sign in as a non-admin member and confirm the API denies access.
2. Sign in as an AOC administrator and open AOC Admin → Audit Log. Change a non-sensitive client setting and confirm a new Admin actions entry. Filter by client and confirm the three lists only show that client's records.
3. Send a client assistant reply, test a builder preview, and send an AOC admin assistant reply. Confirm one AI usage row for each action; token counts may be **Unknown** when the provider does not report them.
4. Test the Make connection and confirm its integration run. Confirm internal Hubstaff runs remain visible in the Internal Audit Log, not the AOC log.

The implementation does not yet apply a retention window or export policy; those need an owner decision before production volume grows. A failed database write can prevent an audited admin action. Python AI usage writes are best-effort and log only a sanitized server-side error if the audit table is unavailable; monitor this after deployment. External provider sub-requests inside one agent action are not individually counted in the action-level ledger. The integration-run list currently covers AOC Make connection tests and AI actions; cached/client Hubstaff reads and provider catalog lookups are **not** yet individually logged as upstream calls. Add instrumentation at those actual fetch boundaries before claiming complete external-call coverage.
