# Client API spending (Admin only)

Open AOC Admin -> AI usage -> Client API spending. Choose a UTC month and export
CSV for extension-pricing/billing review. This is a cost ledger, not an invoice,
payment collection system, prepaid balance, or negotiated client selling price.
The 150-request allowance and its reset function remain independent.

## Install

Run the existing base migrations first. Then, against the intended database:

```powershell
npm run integration-audit:migrate
npm run admin-audit:migrate
node --env-file=.env.local scripts/migrate-ai-costs.mjs --dry-run
npm run ai-costs:migrate
npm run setup:check
```

Restart both local services with `npm run dev`, or deploy the frontend and Python
backend from the same release. Existing tables/data are not rewritten. No extra
provider credential is needed for forward-looking token-based estimates or
OpenRouter's response-reported costs.

## Sources and limits

- Client replies only: staff/admin conversations and builder previews are not
  automatically billed to a client, even if staff selected that client's context.
- The Agents SDK preserves raw **usage metadata**, not prompts or replies. Each
  physical response is priced separately, including multi-turn tool workflows.
- OpenRouter `usage.cost` is stored as provider-reported USD when supplied.
  A genuine numeric zero is retained; an omitted charge is unknown, not zero.
- OpenAI estimates use provider-reported input, output, cache-read and cache-write
  tokens and the checked-in `chatkit_backend/price_catalog.json`. Initial verified
  pricing covers `gpt-6-luna` Standard, including its documented long-context
  multipliers. Cache writes assume provider-default retention; omitted cache-write
  fields are marked in the saved assumptions. Custom tiers, retention, regional
  uplifts, discounts and taxes are not verified billed amounts.
- Rates are reviewed on 2026-10-28 and expire for new estimates after 2026-11-27.
  Review official pricing and update the catalog/version to support another model
  or extend the review date. Every existing row keeps its original rate snapshot;
  changing prices never reprices recorded history.
- Unknown models/usage, incomplete or cancelled calls and non-chat charges remain
  unknown. Image attempts, hosted paid tool calls and library indexing attempts are
  flagged as unpriced rather than silently omitted from a complete-looking total.
  Ongoing storage, uploads outside chat and other applications using the account
  require separate reconciliation. Zero visible cost is never proof of free usage.
- Financial tracking starts when this feature is installed and records subsequent
  instrumented client calls. Prior audit turns without cost records are flagged;
  earlier totals are not reconstructed using today's prices.

The admin endpoint reports known subtotals, separate reported/estimated amounts,
unpriced events and turns without records. A partial-history label appears when
tracking started after that month's beginning. CSV keeps the full decimal amounts
and protects spreadsheet cells against formula injection. Display rounding does
not alter stored totals. No markup, automatic invoice, budget enforcement or
customer payment is implied.

## Storage, isolation and failure behavior

`portal_ai_cost_events` stores decimal `NUMERIC(24,12)` USD, server-established
client ID, an internal run ID, safe token counts, reason code and pricing snapshot.
No raw provider payload, credentials, prompt or reply is persisted in this ledger.
Writes use parameterized SQL and idempotent event keys in one bulk transaction.
Ledger failures are logged without replacing a delivered chat reply; the matching
audit turn then appears as missing cost data. Request-allowance resets do not
delete cost rows. Client deletion unlinks rather than deletes ledger rows; the
admin view groups those rows as Archived/deleted clients. Any further financial
retention/purge policy requires a separate decision.

Only server-authorized AOC administrators can access `/api/admin/ai-spending`.
Client and Internal Portal interfaces are not changed. Queries use the shared
PostgreSQL layer. Refreshes read PostgreSQL, not the provider's billing API, so
they do not add model calls or interrupt ChatKit streaming.

## Actual OpenAI billing reconciliation (not connected by this feature)

OpenAI's Costs API requires authorized server-side administrative billing access.
It returns daily-bucketed charges, not an instant balance. Provider billing cannot
identify portal clients sharing the same request key by portal client ID. Exact
attribution requires dedicated request keys/projects per client plus a verified
mapping and reconciliation job. Do not present this ledger's estimates as those
actual billing results. Historical shared-key charges cannot be reliably split
into exact client invoices after the fact.

References: [GPT-6 Luna pricing](https://developers.openai.com/api/docs/models/gpt-6-luna),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[OpenAI Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs),
[OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).
