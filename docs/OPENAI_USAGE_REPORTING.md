# OpenAI provider usage and cost reporting

The Admin AI Usage page at `/admin?view=usage` now includes **OpenAI usage & costs**.
It uses the read-only organization APIs from the user's requested cookbook:
https://developers.openai.com/cookbook/examples/completions_usage_api

The earlier implementation recorded portal requests and token-based cost estimates.
It did not call these organization reporting endpoints. Those existing per-client
reports and subscription credit limits remain separate and unchanged.

## Private setup: two keys, no manual IDs

Open **Admin → Access & Security → AI provider settings** at
`/admin?view=security#ai-provider-settings`.

1. Enter the normal OpenAI chat API key when replacing it.
2. Enter the organization Admin API key. No Project ID or Organization ID inputs
   are required. The reporting key needs Usage read and Costs read permissions.
   Create it privately at https://platform.openai.com/settings/organization/admin-keys .
3. Choose **Verify & load models**, select a model, then **Save & activate OpenAI**.
   Read-only checks validate the chat key and both reporting endpoints; they do
   not generate a reply or guarantee billing capacity. Keys save encrypted in one
   audited transaction. A replacement chat key still requires re-entering the
   reporting key; model-only changes retain the saved connection.
4. Open **AI Usage** at `/admin?view=usage`. New two-key connections report all
   projects in the reporting key's organization, including other applications.
   Project IDs from provider result rows and organization IDs from provider
   response headers appear as report columns, not editable setup fields. Missing
   metadata is labeled “Not supplied.” If both keys return organization metadata,
   a mismatch is rejected. Missing metadata is explicitly marked as unverified;
   storing two keys together is not proof of matching accounts.
5. Use the **Model** selector or model chips to inspect token/request charts for
   Astra, Sol, Luna or any other reported model. Hover for daily values; click or
   press Enter to pin a date and see its model names. Dollar costs always cover
   the full reported scope: the Costs API does not supply model-level charges.
6. **Client usage by model** uses the portal ledger, not a guess based on shared
   provider totals. It shows client, provider/model, known Organization/Project
   IDs, requests, recorded tokens, known cost and coverage. Its CSV is separate
   from organization-wide usage/cost export. Historical IDs are never backfilled
   using today's connection. New client records retain only observed/verified
   connection identifiers; unavailable IDs remain “Not recorded.” Restart the
   Python backend after updating it to enable this metadata for new records.

`PROVIDER_SETTINGS_SECRET` remains the stable server-only encryption secret.
Python never reads the Admin API key. New organization-wide pairs do not force
manual organization/project headers onto chat requests. Previously saved explicit
project pairs keep their trusted scope until the reporting key is re-entered and
verified using the simpler organization-wide setup.

The compatible schema update, `database/openai-reporting-organization.sql`, runs
after `openai-reporting-pair.sql` through `npm run site-ai:migrate`. Both were
rehearsed on disposable PostgreSQL. The compatible constraint update was applied
to the same verified Supabase project with the existing private migration
connection; before/after record checksums matched. Neon and .env.local were not
changed. No real provider key was submitted to OpenAI tests during this change.
Live provider permissions, header availability and dashboard agreement remain pending.

Environment-only reporting remains available before a database OpenAI connection
exists: privately set `OPENAI_ADMIN_KEY` and optional `OPENAI_USAGE_PROJECT_IDS` in
ignored `.env.local` or the Next.js Vercel project. A saved unpaired/stale chat key
does not silently inherit that environment reporting key. OpenRouter billing is
independent from this OpenAI report.

## Report and interpretation

- `GET /v1/organization/usage/completions`: daily UTC buckets grouped by project
  and model, including input, output, cached input, cache-write and audio counts
  when supplied. Input already includes cached/cache-write tokens; no double count.
  Model request counts can include several provider calls for one portal chat.
- `GET /v1/organization/costs`: daily USD amounts grouped by project and line item.
  These are provider-reported costs, not a locally inferred price or prepaid balance.
  Adjustments can be negative. Amounts are accumulated at twelve decimal places and
  displayed with up to six to keep small dollar values visible. CSV retains twelve.
- Both endpoints use exactly the same server-selected project and time filters.
  The selected month ends at the next UTC month boundary or the current time.
  Provider aggregation can lag; no real-time request-level completeness is claimed.
- Costs may include tools, storage or images outside completion token totals. The
  API does not provide a specific chat-request invoice or a reliable client mapping
  when multiple clients share one OpenAI project. Do not divide organization costs
  among clients or automatically use this report to resolve a historical credit hold.
  AOC fees, monthly prices, payments and client credits are never changed by it.
- The UI provides summaries, expandable daily/model and daily/category tables,
  manual refresh and formula-escaped CSV export. If one endpoint fails, the other
  remains visible; unavailable quantities are not substituted with zero. An empty,
  successful provider response is labeled as no reported activity for the range.

## Boundary and implementation

`/api/admin/openai-usage` calls the existing independent AOC Admin authorization
before lookup and again after the provider round trip. Guests, client accounts,
Internal Portal accounts and revoked administrators must be denied. No client
route, AI tool, agency mode or support privilege is added. The API accepts only a
single month selector; it rejects requested project, credential or endpoint overrides.
Cookies/private response headers remain in place. No client or public static cache
stores this report.

The provider adapter calls only the two fixed HTTPS OpenAI reporting URLs. It has
bounded bodies, rows, pagination and a shared 20-second reporting deadline; requests
never follow redirects or generate inference. It keeps an in-process, maximum-12
entry cache keyed by credential digest, project scope and month, with concurrent
request deduplication. Successful reports cache for 60 seconds, failures for 10.
This is best-effort per-process caching, not a shared database/Redis cache. Admin
authorization is checked on every request, including cache hits; rotation or changed
project configuration cannot reuse another credential/scope's entry.

Saved reporting keys stay encrypted in the existing deployment-wide provider credential table.
Only the Admin password field sends a newly entered key to its authenticated save endpoint;
no GET payload, CSV or diagnostic returns it. Environment-only keys remain server-only.
The portable migration adds TEXT/JSONB columns and a CHECK constraint; no provider SDK,
auth migration, browser database access or client/agency credential inheritance is added.
Existing shared database helpers are reused. The Supabase schema was subsequently updated by the user-authorized migration
follow-up below; Neon remains untouched.

## Verification

Verification passed on the local checkout:

- 451 offline Node tests, including 15 new provider/report/route cases.
- Ten new report browser cases (desktop/touch) plus 26 existing Admin browser
  regressions. These run the actual components on an isolated fixture server,
  with provider/auth responses mocked and database access disabled.
- Changed-file ESLint and an isolated Next.js production build with private
  environment values and database connections disabled.

Commands: `node --test tests/openai-organization-usage.test.mjs tests/openai-usage-route.test.mjs`,
the existing root Node test suite, and Playwright with
`--config tests/admin-readiness/playwright.config.mjs openai-usage.spec.mjs admin.spec.mjs`.
The root development/review server was not used for browser fixture writes.
Desktop/mobile captures verified readable layouts and no outer horizontal overflow;
the tables scroll within their own containers on smaller screens.

The first broad check identified the new route missing from the existing audit
coverage inventory and a forbidden test variable name. Both were corrected, and
the route uses the existing read-only audit bypass: ordinary report GETs still
create no change-audit entries. Two browser fixture assumptions initially failed
under React development Strict Mode's repeated startup effect. The corrected
fixtures trigger refresh failure only after the explicit user action; all report cases passed on rerun.
Permission loss (401/403) also clears the displayed organization report and disables
CSV export; temporary reporting failures may retain clearly labeled previous data.

All provider fixtures are labeled mocks. No live Admin key was configured or API
call made by implementation; browser sign-in/provider-dashboard matching remains
pending user setup.


## Analytics layout follow-up (2026-11-26)

The Admin report now follows the supplied Adoption & consumption reference within
the portal's existing light/blue theme: a large spending total and full-width area
chart, followed by side-by-side token and model-request charts. Small screens stack
the activity panels. Legends, UTC date labels, update timestamps, hover/focus daily
values and keyboard arrow navigation accompany the charts. Detailed tables and
CSV export remain available. No charting dependency or additional provider request
was introduced.

While the Admin key is absent, the same dashboard layout stays visible with
Not connected totals, empty chart frames and muted legends. It draws no sample
peaks, zeros, dollar amounts or growth percentages. Setup instructions sit below
the charts in a compact expandable panel. Genuine empty provider results are
distinguished from disconnected or unavailable reports.

Chart presentation aggregates only the selected period's actual returned daily
observations. Input and output stack; cached input is a subset overlay rather than
extra token consumption. Missing counts remain gaps, negative dollar adjustments
retain their sign, and the current UTC month does not include future activity.
Curves are visual interpolation between daily observations; tooltips/tables retain
the daily values. All financial calculation and authorization paths stay unchanged.

Follow-up verification passed: 457 offline Node tests (six chart aggregation/data
integrity checks added), ten desktop/touch report browser cases including missing
key, real-component chart rendering, keyboard exploration and permission revocation,
changed-file lint and an isolated production build. Provider responses in browser
tests are fixtures, not live OpenAI evidence. Desktop/mobile screenshots were
inspected. No environment values, database records or provider credentials changed.
Live verification still waits for the user to configure the Admin reporting key.

## Paired connection follow-up (November 26, 2026)

Migration and retention: `portal_ai_credentials.encrypted_reporting_key` contains a
purpose-tagged AES-GCM encrypted reporting secret; `reporting_binding` contains only
organization/project IDs, a chat-key SHA-256 binding and verification timestamp.
This is platform-global AOC configuration, never an agency/client grant. Existing
rows have NULL reporting columns and are not silently paired by migration. Back up
the credential record privately before deliberate rotation; encrypt old/new secrets
with the existing managed `PROVIDER_SETTINGS_SECRET`. Rotation is a verified atomic
pair replacement, not two independent saves. An invalid/unreadable saved pair does
not substitute an environment key. An in-flight report detects changed credentials
and returns a safe 409; the UI clears old figures. Report cache keys include key
digest, organization, project and month. No arbitrary API URLs are accepted.

This project reports **all usage within the selected OpenAI project**. Other apps
sharing that project remain included. Provider costs may be delayed and cannot be
treated as a client's prepaid balance or exact per-reply charge. Historical work
under an earlier project remains in that provider project; switching keys does not
merge organizations or move historical charges.

Sources:
- https://developers.openai.com/api/reference/overview/ (organization/project headers)
- https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/methods/retrieve
- https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs/

Verification results and final counts are recorded after the final checks below.


### Final local results

- **Passed:** 469 offline Node tests (provider validation, authenticated routes,
  report parsing/caching and safe credential-rotation behavior included).
- **Passed:** 13 Python provider configuration regressions, including matching
  project headers and rejecting a stale key-to-project binding.
- **Passed:** 12 checks on a fresh disposable WSL PostgreSQL 18 database. Applied
  the migration twice; tested encryption, constraints, runtime headers, public
  redaction, model-only reuse, audited atomic rotation, rollback and preservation
  of an existing synthetic client. The test database/role were removed afterward.
- **Passed:** 16 desktop/mobile Playwright checks against the actual Admin
  components with mocked provider/auth endpoints and database access disabled.
  Verified required pair inputs, rejected checks, clearing secrets on save,
  responsive alignment, actual pointer hover/click and keyboard day selection,
  CSV, unavailable reporting, role revocation and clearing stale project totals.
- **Passed:** changed-file ESLint, `git diff --check`, isolated production build
  using disabled private environment values and unreachable placeholder database.
- **Pending:** approved remote migration; actual key permissions and provider
  pairing; real OpenAI dashboard reconciliation; deployed UI check. No real
  OpenAI request, Supabase/Neon write, .env.local edit, commit or push was performed.

Reproduce offline/UI checks with `node --test "tests/*.test.mjs"`,
`python -m unittest discover -s chatkit_backend/tests -p test_provider_settings.py`,
and `playwright test --config tests/admin-readiness/playwright.config.mjs
provider-pair.spec.mjs openai-usage.spec.mjs`. For the PostgreSQL harness, set
`OPENAI_PAIR_TEST_DATABASE_URL` privately to a newly created loopback
`aoc_pair_test_*` database and set a synthetic `PROVIDER_SETTINGS_SECRET` before
running `node scripts/check-openai-reporting-database.mjs`. Never use a remote or
real-client database for this fixture script.


## Migration activation follow-up (November 26, 2026)

The user ran `npm run site-ai:migrate`. A read-only check found no running
migration and no reporting columns. The runner used only DATABASE_URL despite
an existing private SUPABASE_MIGRATION_DATABASE_URL being configured. Both
connections were verified against the same intended Supabase project before any
write; the operator connection had ownership of the provider credential table.

The runner now prefers the explicit private migration connection, falls back to
DATABASE_URL for other PostgreSQL setups, emits safe progress messages, and uses
an 8-second connection timeout, 5-second lock timeout and 45-second statement
timeout. Errors give an actionable diagnosis without logging credentials.

Completed the exact migration the user initiated: transaction committed;
encrypted_reporting_key and reporting_binding are present and the reporting-pair
constraint is ready. Before/after row counts and checksums of existing fields in
portal_ai_credentials, portal_site_ai_settings, portal_ai_active_provider and
portal_clients matched. No existing key, settings or client records were changed.
No environment file was changed; Neon was not contacted. This supersedes the
earlier pending-remote-migration status. Actual Admin key/project pairing,
provider permissions and dashboard reconciliation remain pending user input in
the Admin form. No inference or OpenAI reporting test was run in this follow-up.


## Simplified organization reporting and model detail (November 26, 2026)

Supersedes the earlier four-field setup and its mandatory project filter. Removed
both ID inputs. Metadata-only verification uses the chat models endpoint and
organization Usage/Costs endpoints with no manually selected project. Known
provider organization mismatches fail before saving; missing response headers do
not become an invented identity or a claim of verified account matching.

Model chips and selector filter tokens/requests locally without extra provider
calls. Cost charts remain scope-wide. Dedicated Organization ID, Project ID and
Model columns are present in provider tables/CSV; Costs rows explicitly state
that a model was not attributed by the API. The bounded client/model view uses
existing client-owned cost events, honors cleared events and reporting resets,
and never treats organization-level totals as individual client charges.

No new cost-ledger columns are needed: non-secret connection metadata is retained
in the existing pricing_snapshot JSONB for future events. Ordinary database
helpers, independent AOC Admin authorization and client credit logic are retained.
The compatibility migration preserves earlier project bindings and adds explicit
organization scope; no nullable agency ownership or tenant visibility grant is added.

Verified locally: 470 offline Node tests; 35 Python checks (13 provider and 22 cost
tracking); 15 disposable WSL PostgreSQL checks; 20 desktop/mobile Playwright
checks. Browser/provider responses are fictional fixtures. PostgreSQL checks
include running both migrations repeatedly, model/client SQL attribution, null
historical IDs, cleared events and resets. The test database was removed afterward.
Changed-file lint, git diff --check and the final isolated production build
passed after the last model-chip changes. Actual provider/header availability and
dashboard reconciliation remain unverified. Existing live clients, saved keys and
settings were unchanged by the approved compatible Supabase schema update.
