# AI Credits: reporting-only allowances

AI Credits is a monthly reporting allowance, not a prepaid wallet. No payment,
invoice, automatic prepaid deduction or new AI access gate is implemented.
Portal monthly AI request caps are disabled; provider quotas still apply. Production billing
needs approval from the portal owner and billing owner before any activation.

## Setup

1. Run the existing cost-ledger/audit migrations if not already installed.
2. Run `npm run credits:migrate` in **client-portal**, then restart local dev.
   It creates only three portable PostgreSQL reporting tables; it seeds no
   pricing or credit allocation and changes no provider API key.
3. Open **AOC Admin > AI usage > AI credit pricing & allowances**, or
   `/admin/credits`. Only an AOC administrator can use its settings API.
4. Choose Fixed Fee or Percentage Markup, enter the AOC fee and credits per USD,
   then calculate a server-side preview. Save only the intended reporting rates.
   The first setup establishes the current UTC month's reporting baseline;
   later saves begin next month. A month already opened keeps its pricing version.
5. Assign a reporting allowance to the intended client and month. Negative
   adjustments append a correction; they never rewrite previous transactions.
6. Clients use the **header balance** to open `/credits`. The adjacent arrow
   opens its navigation on touch/keyboard, and desktop hover opens the dropdown.
   No sidebar entry was added to either portal.

Clients see Overview, Token Usage, History, Transactions and Pricing sections on
one page, in their existing portal shell. Current public AOC fee/conversion terms
are visible, while pricing editing, future versions and administrator identities
remain behind the AOC-admin API. Changing active clients aborts old requests and
the API rejects a mismatching active-client header.

## Arithmetic and cost coverage

The existing `portal_ai_cost_events` ledger remains the source of provider cost
observations, actual token counts and historical official pricing snapshots.
OpenAI costs calculated from tokens are estimates using the saved published
rates; provider-reported costs retain their reported basis. Cached input is part
of input, not extra tokens to add again. Unreported tool/image/storage charges
remain incomplete, never fabricated as zero. AOC pricing cannot edit provider rates.

Percentage fee = API cost × markup / 100.
Fixed fee = the configured amount once per client and UTC billing month.
Total client cost = API cost + AOC fee.
Credits used = total client cost × credits per USD.

The API-cost base includes the portal's recorded providers. Direct OpenAI and
OpenRouter costs are displayed separately; OpenRouter charges are not labeled as
OpenAI charges. Monetary and credit calculations use PostgreSQL NUMERIC and
fixed-point BigInt previews, rounded to 12 decimal places per usage entry.
Only presentation formatting uses JavaScript Number.

The available allowance is manual credits assigned this month minus recorded
usage/service-fee credits. Overages are shown separately; they do not block AI or
collect payment. No opening balance is invented. Missing pricing, unassigned
allowances or unknown/pending costs produce an unconfirmed balance. Historical
usage before tracking began is labeled as partial.

## Persistence and retries

- `portal_ai_credit_pricing`: append-only application pricing versions with
  idempotent save keys and optimistic concurrency checks.
- `portal_ai_credit_periods`: one pricing snapshot per client/month, locked
  while derived usage is processed.
- `portal_ai_credit_entries`: allowances, adjustments, source-cost-event usage,
  and the single fixed-fee entry. Unique source keys and manual request keys
  prevent duplicate deductions. Retrying an actual model call can create another
  legitimate provider charge; redelivering the same recorded event cannot.

Confirmed usage is converted when the client reads their reporting snapshot.
The header uses a lightweight summary, refreshes after ChatKit finishes and checks
again after short commit delays. Hidden tabs skip polling. New cost events arriving
during reconciliation are marked pending until the next refresh.
Deleted clients' cost/credit entries are retained with a null client reference;
they cannot be read through another client's membership.

## Validation and release

See [the local client-readiness review](CLIENT_READINESS.md) for the simplified
client presentation, timestamp-stable history, unresolved cost evidence and
desktop/touch component tests.

Run `node --test tests/credits-*.test.mjs`, `npm run test:credits:database`,
the existing Python cost-tracking tests, and `npm run build`.
Database verification uses synthetic TEMP tables in a single rolled-back
transaction, with repository transactions mapped to savepoints. This keeps
fixtures on one pooled backend and removes them before it is returned to the
pool; it never seeds real client balances or rates. No paid AI request is needed.

Deploy the portal and Python cost-capture update with the same database.
Verify owner-approved reporting rates, tenant access, header interactions and
cost coverage in staging before using these reports for commercial billing.
The implementation has no production billing-activation switch.

Official references:
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) and
[prompt caching usage categories](https://developers.openai.com/api/docs/guides/prompt-caching).

## Reset test usage

Use **Admin > AI Usage > Reset AI usage & credits**. Select the client and
**All recorded history**, preview, then type **RESET** to confirm.
The reset clears consumed credits, AI fees, token history and API dollar totals
from reporting while preserving assigned allowances, manual adjustments and
pricing. The client header and Credits page refresh together. A 600-credit
allowance becomes 600 available before any new usage.

Run `npm run usage-controls:migrate` for existing databases when upgrading.
`npm run test:ai-reset:database` verifies the reset with rollback-only TEMP
fixtures. Raw evidence stays archived for audit. Real provider invoices,
conversations, credentials, Google connections and Hubstaff budgets are unchanged.
