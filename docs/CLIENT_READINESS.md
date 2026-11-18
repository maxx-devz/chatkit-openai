# Local client-readiness review

Scope: `client-portal` only. No deployment, payment integration, new business
pricing or changes to source usage observations. The existing ChatKit, Hubstaff,
authentication and saved-conversation workflows remain in place.

## Credits and recorded data

The saved November 2026 reporting baseline was verified as 1,000 credits per USD
with a 40% AOC fee. A separate 20% version is effective December 2026. November
snapshots have not been repriced. The example uses the selected period's saved
version and backend decimal arithmetic, so November shows $1 + $0.40 = $1.40,
or 1,400 credits; it is clearly illustrative.

Unknown observations inspected on November 17 have no per-call token/cache
breakdown or provider-reported monetary amount. These include unsuccessful AI
calls, specialized tool usage, and a successful routing call with missing usage.
An aggregate reply-token count cannot reliably split those individual calls,
tools and cached input. A failed request is not proof of a zero provider charge.
No costs were invented, removed, or overwritten. Counts may grow with later
activity, so the UI derives them from the authenticated client's selected period.

Available credits and complete client cost stay unconfirmed while coverage is
incomplete. Allocated credits and known usage remain visible as separate figures.
Refresh only rereads saved data; missing historical provider records need review
with provider evidence. This change adds no invoice reconciliation or new paid API
request to recover that evidence.

The existing reporting model keeps each UTC calendar month separate. Allowances
are assigned manually; no automatic grant, renewal, rollover, purchasing or
payment is configured. Historical entries remain visible. Reporting overage does
not block AI. No portal monthly AI request cap or credit-spend access gate is enforced.
Commercial billing, purchased-credit expiry, support/request workflows and rollover
terms require business decisions before any such feature is introduced.

## Client-facing behavior

- The header displays a real verified balance, an explicit unknown/incomplete
  state, or loading/unavailable text. The main link opens `/credits`; Details
  opens balance guidance and navigation by hover, focus or tap. Escape, outside
  clicks and focus departure close it. No Credits sidebar item is added.
- The page prioritizes allocation, known usage, balance, period dates and
  freshness. Tokens, technical costs, history, pricing and transactions are
  expandable and directly addressable from the header.
- Header and page use the same calculation and formatting. Confirmed usage,
  manual refresh and cross-tab allowance notifications refresh them; normal
  polling continues while visible. The API still checks the active membership.
- Transaction order is activity time, recorded time and a unique key, descending.
  Pagination retains a timestamp snapshot; Refresh starts a new snapshot. Cost
  fields on allowance additions say Not applicable. Historical rows identify
  incomplete subtotals or estimates instead of implying complete totals.
- All client panels are inside the main landmark, with a page title and existing
  active navigation. Client-facing assistant naming is consistently AOC AI.
- Search filters permitted portal pages; it does not imply task/conversation
  search. Notifications and policy controls disclose their unavailable prototype
  state, without fake links or a notification count.
- Monthly Time explains the returned timezone, dates, tracked time and budget
  totals. This summary does not expose daily/person time rows. Missing derived
  time is not converted into zero. Project Status prioritizes review work and
  excludes Notes/Ideas reference columns from active task counts.
- Members & Access explains actual role permissions and manual temporary-password
  onboarding. Documents retains its empty state and explains reference links.
  Audit actions have readable labels; original records are unchanged. Account
  makes its password-only scope explicit.

## Verification

Run:

```powershell
npm run test:client-readiness
npm run test:credits:database
npm run test:client-readiness:ui
npm test
npm run build
```

The PostgreSQL script runs real SQL, decimal calculations, duplicate handling,
client isolation, fixed monthly fees, historical versions and pagination against
synthetic TEMP tables in a single rolled-back transaction. It does not seed or
change live client balances. Tests do not regenerate any paid AI reply.

Browser tests launch an isolated preview on port 3115 using the actual portal
components and synthetic API responses. They exercise desktop and touch layouts,
keyboard/hover/tap, unknown/zero/error states, allowance and usage refreshes, and
Viewer/Member/admin navigation. This is component/workflow evidence, not a live
authenticated external-service test or proof of production readiness. Screenshots
contain synthetic information only and are stored in the ignored test output.

Remaining release checks: live authenticated role/access tests, missing provider
cost evidence, provider-usage coverage, approved commercial rules and actual
privacy/terms destinations. Notifications have no connected feed. No deployment
or commercial billing activation was performed.
