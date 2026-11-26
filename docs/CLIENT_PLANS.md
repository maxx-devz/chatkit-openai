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
- Failed, cancelled and interrupted replies are not billed to the client. Any
  provider expense remains separate. Stale workers recover after three minutes;
  completed successful usage with complete evidence is still settled exactly once.
- A successful reply with missing cost metadata needs technical attention. Admin
  sees sanitized provider diagnostics and may explicitly close the incident without
  charging the client. The normal UI does not ask for a guessed provider cost;
  legacy cost reconciliation rejects known failed/cancelled replies.
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


## Usage hold clarity and reconciliation — 2026-11-26

A read-only check of the approved Supabase client plan found a November 23
failed reply in `review` with an unknown provider cost, rather than an active
reply. The old "Checking usage" wording conflated these states. No live run,
balance, plan, payment or audit record was modified by this investigation.

The plan API now exposes a non-sensitive `usageState` for pending usage. A fresh
running reply displays "Reply in progress"; a review record or running record
older than the existing three-minute threshold displays "Review needed".
Both keep `plan_pending` and generation denial. Client responses still exclude
pending run IDs, audit details and payment references. Reads never resolve costs.

Admin verified-cost reconciliation now appears immediately after the plan summary,
before requests, payment forms and saved monthly settings. It explains that adding
credits or waiting does not resolve an unknown cost. The cost starts blank. Review
shows the USD amount and credit debit before explicit confirmation; zero is valid
only when independently verified. Failed requests preserve values and retry keys;
successful confirmation survives refresh. Summary views link to the review area.
This uses the existing authorized, client-scoped, idempotent audited mutation and
does not loosen stale-run or active-reply checks. No migration or new environment
configuration is required.

Verification: 426 offline tests passed; 48 desktop/touch browser tests passed
(mocked APIs, including six new usage-review cases); changed-module lint and an
isolated production build passed. A fresh disposable WSL PostgreSQL instance passed
the Node plan/database checks and eight Python database/gate tests. Those checks
cover fresh versus stale holds, read-only balance preservation, rejection of early
or foreign reconciliation, exactly-once deduction, missing-cost denial, membership
revocation, client isolation and preserved paid-month allowances. The disposable
instance was stopped and removed. No provider calls or real payment actions ran.

That initial cost-review design was superseded by the provider-incident flow below.
Provider expense remains separate from the decision not to charge unsuccessful
client replies. Live provider billing verification was not run.
These source changes are local to `client-documents`, not committed, pushed or
deployed by this fix. Neon, private environment files and Internal Portal behavior
were unchanged. Review at `/admin/credits?client=1#usage-review` on the local server.


## Provider incidents and client non-billing policy — 2026-11-26

This section supersedes the earlier cost-approval UI. A provider rejection, failed
or cancelled reply, or hard-interrupted worker must not make a client enter a
provider cost or request approval to use their existing allowance. These unsuccessful
replies have zero **client** credit debit. Any known or unknown provider expense
remains in the original cost ledger; no provider refund or zero-charge claim is made.

Completed replies continue to consume recorded usage. Successful replies with
missing usage remain a technical incident; they are not silently treated as free.
Admin may explicitly close an unpriced incident without charging the client, with
an audited reason. That decision absorbs unresolved provider expense separately.

The client sees a clear contact-administrator message when technical intervention
is needed. A quota error, temporary rate limit, invalid credentials and a timeout
remain distinct in Admin. Portal credits cannot bypass a provider's own quota,
billing, model availability or capacity limits.

Admin now has an **AI provider incidents** table with curated explanation/next
action, actual HTTP status when supplied, and expandable portal/provider request
references. Missing status is not labelled 200. Secrets, prompts, replies and raw
provider error bodies are never copied into this table. Diagnostic fields are
allowlisted and returned only by the authorized Admin plan response. Safe error
codes also populate the existing integration audit and server logs.

Python stores a terminal reply outcome before cancellable cleanup, independently
attempts lease removal if settlement fails, and uses the existing client plan lock
to recover stale runs after three minutes. A stale unsuccessful run is closed once
without client debit. A completed run with complete cost evidence is settled once
from that evidence. Missing successful usage is not automatically waived. Existing
membership, suspension, payment, plan pause, fresh concurrency and exhaustion checks
remain in force. The legacy verified-cost endpoint rejects known failed/cancelled
requests. No provider retry loop, automatic key change or provider fallback is added.

The implementation reuses `portal_client_plan_runs`, append-only plan audit JSONB,
`portal_ai_usage_events` and `portal_integration_runs.error_code`. No new migration,
environment variable, browser database access or auth change is needed. Deploy
matching Next.js and Python changes together; the current code has not been pushed
or deployed by this task. Private environment values are unchanged.

The guarded `scripts/recover-client-plan-failures.mjs` command previews by default.
It requires an explicit database name and client ID, an active admin actor for
`--apply`, and separate remote approval/`--allow-remote`. It preserves successful
usage, payments, paid allowances and original provider observations; corrections
append audit rows. It is not called by a report GET.

After the user explicitly approved the exact financial correction, two identified
gogrit records were corrected in the approved Supabase database: the failed-reply
1,000-credit charge was reversed and the stale interrupted run closed at zero client
debit. The second application changed zero records. Remaining credits reconciled
to 1,149.514325 (display 1,149.51), with 0.485675 valid used credits, 1,000 included
and 150 extra credits. No pending runs remained. Before/after signatures confirmed
plan settings, payment records and provider-cost evidence unchanged. Original audit
history was retained with correction entries. Neon and other clients were untouched.

Verification passed: 427 offline Node tests; 83 offline Python provider, streaming,
usage, diagnostics and cleanup tests; Node disposable PostgreSQL plan/recovery
checks plus 13 Python database/gate cases; 50 desktop/touch browser cases; focused
lint and isolated production build. Browser/provider responses were mocked. An
initial mobile test assertion omitted the visible column-label prefix; the corrected
accessible-name assertion passed. WSL fixtures were removed afterward. No live paid
AI call or payment action was made; real provider quota restoration and authenticated
end-to-end review remain unverified. The approved credit correction is the only
live data change in this follow-up.

## Completed reply blocked by missing model rates (2026-11-26)

The read-only gogrit investigation found one completed `gpt-5.6-sol` reply in
`review`, with two successful chat cost events and full input/output/cache counts.
There was no active ChatKit lease. Its `model_price_not_verified` reason came from
the local catalog containing only `gpt-6-luna`, not a rejected paid API key or a
reply that was still generating. The client-facing 409 had incorrectly combined
an active reply and a completed usage-recording incident.

The catalog now includes the verified GPT-5.6 Sol standard promotional rates:
USD 4 input, 0.40 cached input, 5 cache write and 20 output per million tokens,
with the documented long-context multipliers. Source:
https://developers.openai.com/api/docs/models/gpt-5.6-sol
Rates are verified for November 26 through November 30, 2026 and must be reviewed
after that promotional window. Existing Luna/Decisions rates and review dates
remain separate. These are estimates with explicit assumptions, not provider
invoice amounts. Missing counts, unknown models, specialized tool charges and
out-of-window prices still cannot be guessed or silently treated as free.

New replies on this verified model settle normally from their recorded token use.
`plan_reply_running` is a retryable 409 only while another reply is active.
`plan_usage_unavailable` is a 503 technical-accounting incident with a distinct
contact-administrator message. The proxy logs a safe reason code alongside the
HTTP status and logs ordinary concurrency conflicts as WARN. Legacy `plan_pending`
remains readable during a coordinated deployment. Restart the Python development
server after the change; deploy matching Next.js/Python versions together.

An explicit repair is available for an existing completed, unpriced reply:
`scripts/reconcile-client-plan-usage.py`. Default execution is a read-only preview;
it requires the exact database, client and run IDs. Remote use additionally needs
`--allow-remote` and authorization for that target. Configure DATABASE_URL through
the private shell or supply `--env-file .env.local`; never paste its value in chat.
Applying additionally requires the approved active admin actor, preview digest,
exact credit amount and `--apply`. It rechecks scope, evidence, status and rates
under a client-plan row lock. Foreign records, invalid administrators, missing
usage or changed evidence reject without partial writes. Replay is idempotent.

Only the reviewed run's status/estimated client debit and append-only plan audit
change. Original provider cost events, their unknown dollar observations, payment
records, subscription configuration and other clients remain untouched. The audit
captures rate source, version, token/cache breakdown and assumptions. This is not
automatic forgiveness of an unpriced successful reply, and an estimate is never
presented as provider-reported money.

The approved-target preview for run `334e46bd-2819-45c0-9b3d-12b78de60965`
calculates USD 0.0542136 = 54.2136 portal credits for its two successful calls.
Applying this one-time correction remains pending the user's explicit choice;
the prior approval covered two different unsuccessful runs. No financial record
has been changed by this investigation or preview. No live AI call was made.

Checks passed: 98 Python connector/provider/stream/pricing regressions (network
providers mocked), 27 Python disposable PostgreSQL checks including five new
reconciliation cases, the Node database plan checker, 436 offline Node tests and
changed-file lint. Fixtures verify normal future settlement, exact repair and
replay, unchanged original evidence, cross-client denial, inactive-admin denial,
missing-cost rejection and distinct 409/503 states. Disposable WSL data was removed.
The isolated production build also passed (no private environment loaded). Neon,
environment files and the paused document-library/instruction work are unchanged.
