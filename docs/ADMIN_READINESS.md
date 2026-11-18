# Admin clients, pricing and credits

Local implementation in `client-portal`. No deployment or real pricing,
allowance, credential, access, request-counter or integration mutation was used
for testing. The configured local application can share its database with other
environments; localhost is not treated as a disposable database.

## Destinations and drafts

- Overview: `/admin`
- Clients: `/admin?view=clients`
- AI Usage: `/admin?view=usage`
- AI Pricing & Credits: `/admin/credits`
- AI Assistant: `/admin?view=assistant`
- Assistant Settings: `/admin/settings` (`/builder` still works)
- Source Connections: `/admin/sources`
- Access & Security: `/admin?view=security`
- Audit Log: `/admin/audit`

Legacy `#clients`, `#portal-usage`, `#assistant`, `#ai-controls` and `#security`
links resolve to their corresponding focused views. Client selection and section
live in the URL, including back/forward navigation. The admin layout retains
client and financial drafts while navigating inside the workspace. Reloading or
leaving the workspace warns when drafts exist. Normal clean navigation does not
ask for confirmation. Drafts are in memory, not stored in browser persistence.

The shared shell supplies the header and content width. Sticky client identity,
save controls and tabs use the measured header height so they do not cover each
other. Mobile uses a stacked list/detail layout and a keyboard-accessible menu.

## AI usage controls

The portal does not enforce a monthly AI request cap. Authentication, membership,
AI enable/disable flags, scoped conversations, request leases and provider quotas
still apply. Hubstaff hours budgets remain independent.

AI Usage > Reset AI usage & credits lets an AOC administrator choose one client,
all clients, or private admin chat, then a UTC month or all history. All history
is selected by default. Preview identifies the client, token counts, known API
dollars and the cutoff. Type RESET to confirm. A signed preview is actor-bound
and expires in ten minutes; old report-clear previews cannot authorize this
broader reset.

A client reset starts reporting afresh across the credit header, Credits
Overview, tokens, API dollars, AOC fees, consumed credits, usage history and usage
transactions. Assigned allowances, manual adjustments and pricing versions are
preserved. Example: 600 assigned credits with all usage reset displays 600
available; a new $0.01 call with 40% markup and 1,000 credits/USD consumes 14,
leaving 586. New unknown costs remain explicitly unknown.

The reset saves a monotonic per-client/all-history-or-month cutoff in
portal_ai_usage_resets. Reads and reconciliation exclude pre-cutoff usage, even
if an older request finishes later. A reset period's old fixed fee cannot be
re-created by refreshing. Raw records remain archived for audit, including
pricing snapshots and idempotency keys. Conversations, Hubstaff budgets/tasks,
Google connections, credentials and actual provider invoices are unchanged.
Installing or testing the feature does not reset real clients.

Apply the additive schema with `npm run usage-controls:migrate`. Existing fresh
AI cost setup also creates the reset table. Runtime queries use the shared
PostgreSQL connection. Test with `npm run test:ai-reset:database`; fixtures use
only TEMP tables and a final rollback, with no model requests.

## Current versus scheduled reporting pricing

Read-only inspection on November 17, 2026 confirmed November pricing at 40%
markup and 1,000 credits/USD, and a scheduled December version at 20% with the
same conversion. These records were not changed. Cards show both, while the
editor and Save identify the period they affect. Server saves reject an outdated
effective month or version, and saved versions remain append-only.

Percentage markup and fixed monthly USD values are separate inputs. Changing the
type does not reinterpret one unit as another. An inactive alternative fee draft
does not enable an unchanged active-price save. Preview uses backend fixed-point
arithmetic; it makes no provider call. Fixed fees remain once per client/month,
and opened periods retain their original pricing version.

## Adjustment reason migration and usage

The additive `reason` column is prepared in `database/ai-credits-schema.sql` and
verified using rollback-only fixtures. It was **not applied to the shared
database** as part of this local UI task.

To enable new reasoned adjustments later:

1. Confirm the intended database/environment without publishing its credentials.
2. Review the additive migration, then run `npm run credits:migrate` against that
   intended database. It seeds no prices or allowances and leaves old reasons null.
3. Reload **AI Pricing & Credits**. Select the client and UTC month, choose Add
   or Subtract, enter credits and a short reason, then preview the adjustment.
4. Review the projected allocation. An incomplete balance stays unconfirmed.
5. Record the adjustment only when intended. Retries retain the request key.

The UI disables recording while the reason schema is absent. Server writes
require a reason for new adjustments and preserve legacy idempotent retries.
Reasons, administrator IDs and original entries remain in the credit audit
ledger; client-facing reports do not receive the internal reason field.

Admin snapshots and adjustment previews are read-only. They do not prepare a
client period or create fee/usage entries just because an administrator viewed
the page. Missing cost evidence or an unprepared period cannot become a fabricated
confirmed balance. Existing missing historical costs still require trustworthy
provider evidence; no historical price was invented or usage deleted.

## Integrations and operational totals

AI knowledge IDs and the approved AI web-search domain, monitored Website Insights
sites, the Hubstaff mapping, project indexing and portal-wide Make automation are
separate sections. Multiple monitored sites do not expand the AI domain allowlist.
Sync and Make tests remain explicit actions separate from Save Client.
Provider key/model verification is distinguished from actual billing/quota.

The old admin total read legacy workspace snapshots. Counts now read
`portal_chatkit_threads`, scoped by client across members and Work/General modes.
They exclude the private AOC admin assistant. Latest activity covers thread
creation or recorded AI requests, separately from presence. Missing tracking
tables produce unavailable totals, not invented zeros. No conversation content
or titles are exposed by these counters.

## Checks and remaining release decisions

```powershell
npm run test:admin-readiness
npm run test:admin-readiness:database
npm run test:credits:database
npm run test:admin-readiness:ui
npm test
npm run build
```

Database scripts pin synthetic TEMP tables to one transaction and roll back.
They execute actual request reservation/reset SQL and verify tenant scope,
historical counters, exact prices, fixed-fee-once behavior, audit reasons,
idempotency, missing costs and read-only snapshots. Browser tests use the real
components in an isolated preview with consequential API actions mocked.
They cover desktop/touch layout, navigation, retained edits, failed saves,
distinct pricing units, incomplete balances and retry keys. They do not establish
live provider capacity or constitute production authorization/security signoff.

Credits remain reporting-only. Before replacing request limits, owners must
approve commercial rules (including failures, refunds, resets and overage),
complete per-provider/tool cost coverage, implement atomic credit reservations
and settlement with concurrency/idempotency and recovery tests, and validate
tenant access and live operational behavior. Keep the existing request ceiling
until that work and review are complete. No credit enforcement or billing rollout
was added here.
