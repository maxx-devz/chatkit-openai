# Client monthly plans and included AI credits

This replaces the primary global reporting-price editor with per-client monthly
plans. Existing legacy pricing, fee entries, allowances and usage history are not
deleted or converted into plan charges. No existing client is automatically enrolled.

## Admin workflow

1. Sign in as an authorized AOC administrator. Open **Clients → AI Usage & Credits
   → Manage this client’s plan**, or **Plans & Credits** (`/admin/credits`).
2. Choose the client. Enter the monthly portal price in USD and the included AI
   credits. They are independent commercial choices. No credit count is prefilled.
3. To activate the current UTC month, verify the payment outside the portal,
   enter an invoice/receipt reference and check the confirmation. Add a short
   business reason, review, then confirm. Saving without activation configures
   the plan and enables credit checks, but does not grant this month’s AI credits;
   new AI replies pause until payment is confirmed.
4. Existing paid-month allowances stay unchanged when future plan settings are
   edited. Pausing a plan blocks new replies immediately; it does not terminate
   a reply already running or revoke ordinary document/history permissions.
5. For extra usage, agree the price and verify payment externally. Use **Add paid
   credits**, enter credits, amount received, payment reference and reason, then
   review and confirm. Link an open client request when applicable.
6. A new month needs payment confirmation before its included credits activate.
   No credit rollover, automatic card charges, automatic subscription collection,
   invoice creation, real emails or payment-provider verification is implemented.

The legacy global fixed fee is not deducted from a plan allowance. The monthly
portal price includes the chosen credits; it is not an additional AI usage debit.
The initial conversion is fixed at **1,000 credits per US$1 of recorded AI provider
cost**. Commercial plan/top-up prices need not equal the provider-cost allowance.
No discount, refund, SLA or other commercial obligation is inferred.

## Client workflow

`/credits` shows the paid month’s portal price, included/extra credits, settled
AI usage and remaining credits. Members with existing AI-use permission can
request more credits or an upgrade. A request is a portal record for Admin review;
it does not send an email, charge money or grant credits. Viewers cannot request
changes. One pending request per client prevents repeated submissions.

Saved conversations remain readable when credits run out. The signed Python
backend checks active client membership, plan status, current-month entitlement,
pending work and remaining credits for every new reply/retry in either chat mode.
Browser controls are not the access boundary. A deployment must ship the matching
Next.js and Python changes and schema together before enabling a client plan.

## Enforcement and accounting limits

- Admission is serialized across every user of a client by a transaction/plan
  row lock and one partial-unique active-run record. Database sessions do not
  retain tenant variables, advisory locks or session role switches.
- The reservation UUID is also the existing cost ledger’s request ID. Only that
  request/client’s observations settle its run; retries do not double-settle it.
- Only recorded provider cost consumes plan credits; no legacy fixed or percentage
  reporting fee is included. Estimates retain the cost ledger’s existing limits.
- **This is a before-reply credit limit, not a guaranteed provider dollar cap.**
  A reply admitted with a positive balance can finish above the remaining amount;
  the next reply is denied. Existing 95-second stream and model-turn bounds remain.
  Provider invoices are not automatically reconciled by this feature.
- Missing/failing cost writes, cancelled replies with incomplete usage, tool
  costs without pricing and interrupted workers hold further replies for review.
  A stale run is never silently assumed free or automatically expired. Admin can
  record a verified provider cost with an audit reason to release a review hold,
  or a running hold older than three minutes. Check provider records first.
- Reporting resets do not replenish paid credits. Payment reference, operator
  audit details and pending run IDs are not included in client plan responses.
- Admin-only plan, payment confirmation, top-up, review resolution and request
  closure are audited. Existing AOC Admin authorization and Internal Portal
  exclusions remain independent. No agency rollout or platform mode is enabled.

## Database and private configuration

`database/client-plans.sql` is additive standard PostgreSQL: bounded NUMERIC,
BIGINT, UUID, foreign keys, partial indexes and a shared balance view. The Node
runtime uses `lib/database.js`; Python uses `chatkit_backend/database.py`.
No Supabase SDK, browser database access, external queue or payment SDK is added.
This branch continues to use application authorization, not claimed tenant RLS.

The version/checksum migration verifies the named database before writes, supports
`--dry-run`, repeats safely and applies least-needed grants to the runtime role.
Keep the operator connection private as `CLIENT_PLANS_MIGRATION_DATABASE_URL`
(optional ignored local setup file); leave runtime `DATABASE_URL` restricted.

```powershell
npm run client-plans:migrate -- --confirm-database APPROVED_DATABASE --app-role RUNTIME_ROLE --dry-run
npm run client-plans:migrate -- --confirm-database APPROVED_DATABASE --app-role RUNTIME_ROLE
```

Remote application additionally needs explicit target approval and `--allow-remote`.
These instructions do not authorize modifying Neon or another database. No new
provider credential, sign-in or consent is needed for synthetic verification.
Never paste passwords, tokens, card data or private payment evidence into chat.

## Verification

See the client-plan follow-up in `PORTAL_UI_REVIEW.md` for actual final results.
Database checks are restricted to a fresh disposable loopback PostgreSQL database.
Browser fixtures mock API/provider responses; live provider billing and payment
verification are not established by those tests.


## Local activation record (2026-11-20)

The reviewed versions 1 and 2 were previewed (rolled back), then applied to the
same approved fresh Supabase target used by this checkout. Existing row counts
across all 66 preexisting application tables reconciled before/after. Zero client
plans, top-ups or payment confirmations were created. `.env.local` was unchanged;
Neon and hosted deployment settings were not touched.

Version 2 explicitly revokes PUBLIC and optional `anon`/`authenticated` access
to new tables, the balance view and audit sequence, overriding permissive hosting
defaults. Disposable fixtures deliberately enabled such defaults and verified
denial afterward. Actual Supabase runtime/browser-role checks also passed.

No additional local configuration is missing for reviewing these screens.
For another installation, configure its approved migration operator URL privately
and deploy the matching web/Python code together. Live AI cost recording for the
selected provider/model still needs a small separately approved check before
relying on it for a customer allowance; no live paid calls were made here.


## Plan save/update feedback ? 2026-11-20

Monthly-plan saves/updates and paid-credit additions now show explicit green confirmation after the API acknowledges success. Confirmation state is owned by the client workspace, so it survives keyed form remounts after refreshing data. It clears when editing the corresponding form or switching clients. Messages distinguish a saved plan awaiting payment confirmation, activation, paused access and future settings that preserve an existing paid month. Duplicate responses are identified without claiming another update or addition.

Saving/recording buttons and aria-busy expose pending work. Success and error feedback sits near the action button, uses accessible live regions and scrolls into view when outside the viewport (respecting reduced motion). Failed saves keep input and the retry key, with no false success. A successful save followed by a failed refresh keeps its confirmation, explains the read failure and allows Refresh plan to recover without another save/payment.

Verified with 14 focused desktop/mobile browser cases using mocked APIs: creation, update, paid activation/top-up, pending payment, preserved paid allowance, client switching, failed-save retry and refresh-failure recovery. Confirmations and errors were checked in the viewport. Changed-module lint and isolated production build passed. No real plan values, balances, payments, database schema, credentials or environment files were changed. No live provider or financial requests were used. The local review server was restored; no commit or push.
